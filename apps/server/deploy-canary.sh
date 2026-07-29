#!/usr/bin/env bash

# Node Lambda 发布不依赖 CodeDeploy：API Gateway 始终调用 live alias，脚本先将
# 当前版本固化为稳定版本，再更新 $LATEST、发布新版本并执行 90/10 -> 100/0。
set -euo pipefail

readonly FUNCTION_NAME="github-account-info-api"
readonly ALIAS_NAME="live"
readonly STACK_NAME="github-account-info"
readonly API_BASE_URL="${PUBLIC_API_BASE_URL:-}"
readonly CORS_ORIGIN="${CORS_ORIGIN:-}"

required_variables=(
  AWS_DEFAULT_REGION
  DATABASE_URL
  PROFILE_EVENTS_TOPIC_ARN
  PUBLIC_API_BASE_URL
  CORS_ORIGIN
  LAMBDA_SUBNET_IDS
  LAMBDA_SECURITY_GROUP_IDS
)
for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "required environment variable is missing: ${variable_name}" >&2
    exit 1
  fi
done

ai_ops_incident_table=""
ai_ops_incident_table_arn=""
ai_ops_queue_url=""
ai_ops_queue_arn=""
readonly AI_OPS_STACK_NAME="github-account-info-ai-ops"
performance_queue_url=""
performance_queue_arn=""
readonly PERFORMANCE_STACK_NAME="github-account-info-performance"

# AI Ops 是独立 stack；Node 部署只读取它的非敏感输出，不复制或硬编码资源标识。
# stack 尚未部署时保留空参数，维持旧环境的兼容行为；stack 存在时四项必须完整。
if aws cloudformation describe-stacks \
  --region "$AWS_DEFAULT_REGION" \
  --stack-name "$AI_OPS_STACK_NAME" >/dev/null 2>&1; then
  read_ai_ops_output() {
    local output_key="$1"
    aws cloudformation describe-stacks \
      --region "$AWS_DEFAULT_REGION" \
      --stack-name "$AI_OPS_STACK_NAME" \
      --query "Stacks[0].Outputs[?OutputKey=='${output_key}'].OutputValue | [0]" \
      --output text
  }

  ai_ops_incident_table="$(read_ai_ops_output IncidentTableName)"
  ai_ops_incident_table_arn="$(read_ai_ops_output IncidentTableArn)"
  ai_ops_queue_url="$(read_ai_ops_output InvestigationQueueUrl)"
  ai_ops_queue_arn="$(read_ai_ops_output InvestigationQueueArn)"

  for ai_ops_value in \
    "$ai_ops_incident_table" \
    "$ai_ops_incident_table_arn" \
    "$ai_ops_queue_url" \
    "$ai_ops_queue_arn"; do
    if [[ -z "$ai_ops_value" || "$ai_ops_value" == "None" ]]; then
      echo "AI Ops stack exists but required outputs are incomplete" >&2
      exit 1
    fi
  done
fi

# Performance stack 也是独立生命周期；存在时 URL/ARN 必须同时完整。
if aws cloudformation describe-stacks \
  --region "$AWS_DEFAULT_REGION" \
  --stack-name "$PERFORMANCE_STACK_NAME" >/dev/null 2>&1; then
  read_performance_output() {
    local output_key="$1"
    aws cloudformation describe-stacks \
      --region "$AWS_DEFAULT_REGION" \
      --stack-name "$PERFORMANCE_STACK_NAME" \
      --query "Stacks[0].Outputs[?OutputKey=='${output_key}'].OutputValue | [0]" \
      --output text
  }

  performance_queue_url="$(read_performance_output PerformanceQueueUrl)"
  performance_queue_arn="$(read_performance_output PerformanceQueueArn)"
  for performance_value in "$performance_queue_url" "$performance_queue_arn"; do
    if [[ -z "$performance_value" || "$performance_value" == "None" ]]; then
      echo "Performance stack exists but queue outputs are incomplete" >&2
      exit 1
    fi
  done
fi

stable_version=""
set +e
# get-alias 在首次部署会返回非零。这里临时关闭 `set -e` 是为了区分“alias
# 尚不存在”与后续真实错误，读取完退出码后立即恢复严格模式。
stable_version="$(
  aws lambda get-alias \
    --region "$AWS_DEFAULT_REGION" \
    --function-name "$FUNCTION_NAME" \
    --name "$ALIAS_NAME" \
    --query FunctionVersion \
    --output text 2>/dev/null
)"
alias_status=$?
set -e

if [[ "$alias_status" -ne 0 ]]; then
  # 第一次启用 alias 时，先把当前线上 $LATEST 固化为稳定版本。
  stable_version="$(
    aws lambda publish-version \
      --region "$AWS_DEFAULT_REGION" \
      --function-name "$FUNCTION_NAME" \
      --description "baseline before native alias canary" \
      --query Version \
      --output text
  )"
  aws lambda create-alias \
    --region "$AWS_DEFAULT_REGION" \
    --function-name "$FUNCTION_NAME" \
    --name "$ALIAS_NAME" \
    --function-version "$stable_version" >/dev/null
fi

if [[ ! "$stable_version" =~ ^[0-9]+$ ]]; then
  echo "live alias does not reference a published Lambda version" >&2
  exit 1
fi

# CloudFormation 更新 $LATEST 和 SNS 权限；API integration 仍通过 live alias
# 指向 stable_version，因此模板更新期间不会提前暴露新代码。Lambda VPC 物理 ID
# 必须来自当前目标账号的 repository variables，禁止回退到其他账号的默认值。
parameter_overrides=(
  "DatabaseUrl=$DATABASE_URL"
  "CorsOrigin=$CORS_ORIGIN"
  "ProfileEventsTopicArn=$PROFILE_EVENTS_TOPIC_ARN"
  "AiOpsIncidentTableName=$ai_ops_incident_table"
  "AiOpsIncidentTableArn=$ai_ops_incident_table_arn"
  "AiOpsQueueUrl=$ai_ops_queue_url"
  "AiOpsQueueArn=$ai_ops_queue_arn"
  "PerformanceQueueUrl=$performance_queue_url"
  "PerformanceQueueArn=$performance_queue_arn"
  "LambdaSubnetIds=$LAMBDA_SUBNET_IDS"
  "LambdaSecurityGroupIds=$LAMBDA_SECURITY_GROUP_IDS"
)

smoke_once() {
  local path="$1"
  local attempt

  for attempt in {1..3}; do
    # 只验证公开入口，不直接调用 Lambda；这样同时覆盖 API Gateway integration
    # 是否仍指向 live alias。短暂网络抖动允许三次尝试，持续失败才回滚。
    if curl \
      --fail \
      --silent \
      --show-error \
      --max-time 10 \
      "${API_BASE_URL}${path}" >/dev/null; then
      return 0
    fi
    echo "Lambda canary probe ${path} failed (${attempt}/3)" >&2
    sleep 2
  done

  return 1
}

sam_output_file="$(mktemp)"
cleanup_sam_output() {
  rm -f "$sam_output_file"
}
trap cleanup_sam_output EXIT

sam deploy \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --parameter-overrides "${parameter_overrides[@]}" \
  2>&1 | tee "$sam_output_file"

# 基础设施/文档改动也可能触发 workflow。SAM 明确确认 Stack 无变化时，$LATEST
# 没有可发布的新代码或配置；保留现有 live alias，验证公开入口后成功结束。
if grep -Fq "No changes to deploy. Stack ${STACK_NAME} is up to date" "$sam_output_file"; then
  smoke_once /
  smoke_once /healthz
  smoke_once /readyz
  echo "Lambda deployment is already up to date; live alias unchanged"
  exit 0
fi

aws lambda wait function-updated-v2 \
  --region "$AWS_DEFAULT_REGION" \
  --function-name "$FUNCTION_NAME"

candidate_version="$(
  aws lambda publish-version \
    --region "$AWS_DEFAULT_REGION" \
    --function-name "$FUNCTION_NAME" \
    --description "native alias canary candidate" \
    --query Version \
    --output text
)"

if [[ ! "$candidate_version" =~ ^[0-9]+$ || "$candidate_version" == "$stable_version" ]]; then
  echo "unable to publish a distinct candidate Lambda version" >&2
  exit 1
fi

clear_routing_and_point_to() {
  local version="$1"
  # 显式传空 AdditionalVersionWeights，避免上一次灰度的候选权重残留。
  aws lambda update-alias \
    --region "$AWS_DEFAULT_REGION" \
    --function-name "$FUNCTION_NAME" \
    --name "$ALIAS_NAME" \
    --function-version "$version" \
    --routing-config '{"AdditionalVersionWeights":{}}' >/dev/null
}

observe_canary() {
  local interval
  local request

  # 10 个 30 秒窗口组成固定五分钟观察期。每个窗口多次请求，增加 10%
  # candidate 权重被实际命中的机会；healthz/readyz 同时覆盖 Go 公网依赖。
  for interval in {1..10}; do
    for request in {1..10}; do
      smoke_once /
      smoke_once /healthz
      smoke_once /readyz
    done
    echo "Lambda canary observation interval ${interval}/10 passed"
    sleep 30
  done
}

# 主版本仍是 stable，candidate 仅通过附加权重接收 10% 调用。
aws lambda update-alias \
  --region "$AWS_DEFAULT_REGION" \
  --function-name "$FUNCTION_NAME" \
  --name "$ALIAS_NAME" \
  --function-version "$stable_version" \
  --routing-config "AdditionalVersionWeights={${candidate_version}=0.1}" >/dev/null

if ! observe_canary; then
  echo "Lambda canary failed; restoring version ${stable_version}" >&2
  clear_routing_and_point_to "$stable_version"
  exit 1
fi

clear_routing_and_point_to "$candidate_version"
echo "Lambda canary completed: live -> version ${candidate_version}"
