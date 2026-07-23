#!/usr/bin/env bash

# Go production 发布编排：稳定 Service 保留 Cloud Map；独立 Canary Service
# 只接入公开 ALB。发布按 10% 观察、100% Canary、稳定 Service Rolling 晋级、
# Canary 缩容四个阶段执行，任一阶段失败都恢复旧镜像与 100/0 流量。
set -euo pipefail

readonly IMAGE_TAG="${1:-}"
readonly TEMPLATE_FILE="infra/go-production.yaml"

required_variables=(
  AWS_DEFAULT_REGION
  PROJECT_NAME
  PRODUCTION_STACK_NAME
  ECS_CLUSTER_NAME
  ECS_SERVICE_NAME
  PUBLIC_API_BASE_URL
  CORS_ORIGINS
)

for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "required environment variable is missing: ${variable_name}" >&2
    exit 1
  fi
done

readonly CANARY_ECS_SERVICE_NAME="${ECS_SERVICE_NAME}-canary"

if [[ ! "$IMAGE_TAG" =~ ^prod-[0-9a-f]{40}$ ]]; then
  echo "image tag must use prod-<full-lowercase-git-sha>" >&2
  exit 1
fi

if [[ ! "$PUBLIC_API_BASE_URL" =~ ^https://[a-z0-9-]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$ ]]; then
  echo "PUBLIC_API_BASE_URL is not an API Gateway base URL" >&2
  exit 1
fi

stack_existed=false
previous_image_tag=""

set +e
stack_description="$(
  aws cloudformation describe-stacks \
    --region "$AWS_DEFAULT_REGION" \
    --stack-name "$PRODUCTION_STACK_NAME" \
    --output json 2>&1
)"
describe_status=$?
set -e

if [[ "$describe_status" -eq 0 ]]; then
  stack_existed=true
  # CloudFormation 参数是上一次成功部署的事实来源，不从当前 ECS task 或 latest
  # tag 反推版本，确保失败恢复到明确的不可变镜像。
  previous_image_tag="$(
    aws cloudformation describe-stacks \
      --region "$AWS_DEFAULT_REGION" \
      --stack-name "$PRODUCTION_STACK_NAME" \
      --query 'Stacks[0].Parameters[?ParameterKey==`ImageTag`].ParameterValue | [0]' \
      --output text
  )"
  if [[ ! "$previous_image_tag" =~ ^prod-[0-9a-f]{7,40}$ ]]; then
    echo "existing production stack has no valid ImageTag parameter" >&2
    exit 1
  fi
elif [[ "$stack_description" != *"does not exist"* ]]; then
  echo "unable to determine whether the production stack exists" >&2
  exit 1
fi

deploy_release() {
  local stable_image_tag="$1"
  local canary_image_tag="$2"
  local stable_weight="$3"
  local canary_weight="$4"
  local canary_desired_count="$5"

  # ALB 会按相对权重分流，但脚本要求总和固定为 100，让 90/10 等值可直接理解
  # 为百分比，也避免误传 90/0 后产生与预期不符的比例。
  if (( stable_weight + canary_weight != 100 )); then
    echo "stable and canary traffic weights must total 100" >&2
    return 1
  fi

  aws cloudformation deploy \
    --region "$AWS_DEFAULT_REGION" \
    --stack-name "$PRODUCTION_STACK_NAME" \
    --template-file "$TEMPLATE_FILE" \
    --no-fail-on-empty-changeset \
    --parameter-overrides \
      ProjectName="$PROJECT_NAME" \
      ImageTag="$stable_image_tag" \
      CanaryImageTag="$canary_image_tag" \
      DesiredCount=1 \
      CanaryDesiredCount="$canary_desired_count" \
      StableTrafficWeight="$stable_weight" \
      CanaryTrafficWeight="$canary_weight" \
      CorsOrigins="$CORS_ORIGINS" \
    --tags \
      Project="$PROJECT_NAME" \
      Environment=production \
      ManagedBy=cloudformation
}

wait_for_services() {
  # services-stable 同时等待 deployment 数量、running count 和 rollout 收敛；
  # 它不等价于 ALB target healthy，所以 Canary 还要执行下一层显式检查。
  aws ecs wait services-stable \
    --region "$AWS_DEFAULT_REGION" \
    --cluster "$ECS_CLUSTER_NAME" \
    --services "$@"
}

smoke_test() {
  local path="$1"
  local attempt

  for attempt in {1..12}; do
    if curl \
      --fail \
      --silent \
      --show-error \
      --max-time 10 \
      "${PUBLIC_API_BASE_URL}${path}" >/dev/null; then
      return 0
    fi
    echo "Smoke test ${path} attempt ${attempt}/12 failed; retrying in 5 seconds" >&2
    sleep 5
  done

  return 1
}

canary_target_group_arn() {
  # 使用 Stack Output 获取 ARN，避免在脚本里重写 CloudFormation 的命名规则。
  aws cloudformation describe-stacks \
    --region "$AWS_DEFAULT_REGION" \
    --stack-name "$PRODUCTION_STACK_NAME" \
    --query 'Stacks[0].Outputs[?OutputKey==`AlternateTargetGroupArn`].OutputValue | [0]' \
    --output text
}

wait_for_canary_target() {
  local target_group_arn
  local state
  local attempt

  target_group_arn="$(canary_target_group_arn)"
  # Target Group 健康检查当前使用 /healthz；通过后再由 smoke_test /readyz
  # 验证数据库依赖，避免把启动中的 Task 直接纳入 10% 观察结论。
  for attempt in {1..24}; do
    state="$(
      aws elbv2 describe-target-health \
        --region "$AWS_DEFAULT_REGION" \
        --target-group-arn "$target_group_arn" \
        --query 'TargetHealthDescriptions[0].TargetHealth.State' \
        --output text
    )"
    if [[ "$state" == "healthy" ]]; then
      return 0
    fi
    echo "Canary target state is ${state}; waiting for healthy (${attempt}/24)" >&2
    sleep 5
  done

  return 1
}

observe_canary() {
  local interval
  local request

  # 十个 30 秒窗口组成固定 5 分钟观察期。每个窗口发送多次真实请求，
  # 同时由 Target Group health 保证 Canary Task 本身已就绪。
  for interval in {1..10}; do
    for request in {1..10}; do
      smoke_test /healthz
      smoke_test /readyz
    done
    echo "Canary observation interval ${interval}/10 passed"
    sleep 30
  done
}

restore_previous_release() {
  if [[ "$stack_existed" == "true" ]]; then
    # 同时恢复镜像、权重和 Canary desired count，避免只回滚流量却继续为
    # 故障候选 Task 付费，或 CloudFormation 参数仍记录候选版本。
    echo "Restoring stable image ${previous_image_tag} and disabling canary" >&2
    deploy_release "$previous_image_tag" "$previous_image_tag" 100 0 0
    wait_for_services "$ECS_SERVICE_NAME" "$CANARY_ECS_SERVICE_NAME"
    return
  fi

  # 首次部署没有可回退的旧版本；删除只包含生产 workload 的 runtime Stack，
  # foundation 中的 VPC、ECR、RDS、日志与数据均不在删除范围内。
  echo "Initial production release failed; deleting the runtime stack" >&2
  aws cloudformation delete-stack \
    --region "$AWS_DEFAULT_REGION" \
    --stack-name "$PRODUCTION_STACK_NAME"
  aws cloudformation wait stack-delete-complete \
    --region "$AWS_DEFAULT_REGION" \
    --stack-name "$PRODUCTION_STACK_NAME"
}

if [[ "$stack_existed" == "false" ]]; then
  deploy_release "$IMAGE_TAG" "$IMAGE_TAG" 100 0 0
  wait_for_services "$ECS_SERVICE_NAME" "$CANARY_ECS_SERVICE_NAME"
  smoke_test /healthz
  smoke_test /readyz
  echo "Initial production release is stable"
  exit 0
fi

# Phase 1: 稳定版本保持不动，新版本用独立 Service 接收 10% 公网流量。
if ! deploy_release "$previous_image_tag" "$IMAGE_TAG" 90 10 1 \
  || ! wait_for_services "$ECS_SERVICE_NAME" "$CANARY_ECS_SERVICE_NAME" \
  || ! wait_for_canary_target \
  || ! observe_canary; then
  restore_previous_release
  exit 1
fi

# Phase 2: 观察通过后先把公网全部交给 Canary，隔离稳定 Service 的 Rolling 晋级。
if ! deploy_release "$previous_image_tag" "$IMAGE_TAG" 0 100 1 \
  || ! smoke_test /healthz \
  || ! smoke_test /readyz; then
  restore_previous_release
  exit 1
fi

# Phase 3: 稳定 Service 在 Cloud Map 链路中做零停机 Rolling 更新。
if ! deploy_release "$IMAGE_TAG" "$IMAGE_TAG" 0 100 1 \
  || ! wait_for_services "$ECS_SERVICE_NAME" "$CANARY_ECS_SERVICE_NAME" \
  || ! smoke_test /healthz \
  || ! smoke_test /readyz; then
  restore_previous_release
  exit 1
fi

# Phase 4: 公网切回已晋级的稳定 Service，Canary Service 保留但缩容为 0。
if ! deploy_release "$IMAGE_TAG" "$IMAGE_TAG" 100 0 0 \
  || ! wait_for_services "$ECS_SERVICE_NAME" "$CANARY_ECS_SERVICE_NAME" \
  || ! smoke_test /healthz \
  || ! smoke_test /readyz; then
  restore_previous_release
  exit 1
fi

echo "Production canary release completed: stable=100%, canary=0 tasks"
