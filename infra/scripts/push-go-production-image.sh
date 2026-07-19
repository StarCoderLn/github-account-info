#!/usr/bin/env bash

# 首次/人工 production 镜像发布脚本。它不部署 CloudFormation，只从 foundation
# Stack 读取 ECR 地址，验证源码和镜像安全属性后推送不可变 Git SHA tag。
set -euo pipefail

readonly AWS_REGION="${AWS_DEFAULT_REGION:-us-east-2}"
readonly FOUNDATION_STACK_NAME="${FOUNDATION_STACK_NAME:-github-account-info-go-foundation}"
readonly LOCAL_IMAGE="github-account-info-go:production-bootstrap"
readonly GO_MOD_CACHE_VOLUME="github-account-info-go-mod-cache"
readonly GO_BUILD_CACHE_VOLUME="github-account-info-go-build-cache"

for command_name in aws docker git; do
  # 在做任何构建或云端操作前先检查本地依赖，尽早给出明确错误。
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command not found: ${command_name}" >&2
    exit 1
  fi
done

if [[ -n "$(git status --porcelain)" ]]; then
  # 镜像 tag 与 Git commit 必须一一对应；脏工作区会让同一 SHA 无法还原源码。
  echo "Refusing to publish: the Git worktree is not clean." >&2
  echo "Commit the exact reviewed source before assigning an immutable production tag." >&2
  exit 1
fi

commit_sha="$(git rev-parse HEAD | tr '[:upper:]' '[:lower:]')"
if [[ ! "${commit_sha}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "HEAD is not a full lowercase Git commit SHA." >&2
  exit 1
fi

repository_uri="$(
  # ECR URI 来自 foundation Stack Output，不在脚本中复制账号/仓库配置。
  aws cloudformation describe-stacks \
    --region "${AWS_REGION}" \
    --stack-name "${FOUNDATION_STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`EcrRepositoryUri`].OutputValue | [0]' \
    --output text \
    --no-cli-pager
)"

if [[ ! "${repository_uri}" =~ ^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com(/[a-z0-9._/-]+)+$ ]]; then
  echo "Foundation stack did not return a valid ECR repository URI." >&2
  exit 1
fi

registry="${repository_uri%%/*}"
image_tag="prod-${commit_sha}"
image_uri="${repository_uri}:${image_tag}"

builder_image="$(awk '$1 == "ARG" && $2 ~ /^GO_IMAGE=/ { sub(/^GO_IMAGE=/, "", $2); print $2; exit }' apps/go-api/Dockerfile)"
# builder 镜像必须固定 digest，防止同一 tag 在不同时间解析成不同工具链。
if [[ "${builder_image}" != *@sha256:* ]]; then
  echo "Go builder image must be pinned by digest." >&2
  exit 1
fi

unformatted="$(
  # 使用与 Dockerfile 相同的 Go builder 检查格式，避免依赖本机 Go 版本。
  docker run --rm \
    --volume "${PWD}/apps/go-api:/src:ro" \
    --workdir /src \
    "${builder_image}" \
    sh -c 'gofmt -l .'
)"
if [[ -n "${unformatted}" ]]; then
  printf 'Unformatted Go files:\n%s\n' "${unformatted}" >&2
  exit 1
fi

docker run --rm \
  --volume "${PWD}/apps/go-api:/src:ro" \
  --volume "${GO_MOD_CACHE_VOLUME}:/go/pkg/mod" \
  --workdir /src \
  "${builder_image}" \
  go mod verify

docker run --rm \
  --volume "${PWD}/apps/go-api:/src:ro" \
  --volume "${GO_MOD_CACHE_VOLUME}:/go/pkg/mod" \
  --volume "${GO_BUILD_CACHE_VOLUME}:/root/.cache/go-build" \
  --workdir /src \
  "${builder_image}" \
  go vet ./...

docker run --rm \
  --volume "${PWD}/apps/go-api:/src:ro" \
  --volume "${GO_MOD_CACHE_VOLUME}:/go/pkg/mod" \
  --volume "${GO_BUILD_CACHE_VOLUME}:/root/.cache/go-build" \
  --workdir /src \
  "${builder_image}" \
  go test ./...

DOCKER_BUILDKIT=1 docker build \
  --platform linux/amd64 \
  --pull \
  --tag "${LOCAL_IMAGE}" \
  --tag "${image_uri}" \
  apps/go-api

# 构建后检查最终 runtime 用户，防止 Dockerfile 改动意外让容器以 root 运行。
if [[ "$(docker image inspect --format '{{.Config.User}}' "${image_uri}")" != "65532:65532" ]]; then
  echo "Runtime image is not configured as the expected non-root user." >&2
  exit 1
fi

aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${registry}"

docker push "${image_uri}"

image_digest="$(
  # push 后再从 ECR 读取 digest，确认远端已经保存预期镜像而不只相信本地输出。
  aws ecr describe-images \
    --region "${AWS_REGION}" \
    --repository-name "${repository_uri#*/}" \
    --image-ids "imageTag=${image_tag}" \
    --query 'imageDetails[0].imageDigest' \
    --output text \
    --no-cli-pager
)"

if [[ ! "${image_digest}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "ECR did not return a valid digest for the published image." >&2
  exit 1
fi

echo "Published ${image_uri}"
echo "Digest: ${image_digest}"
