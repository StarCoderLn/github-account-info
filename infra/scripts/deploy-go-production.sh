#!/usr/bin/env bash

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
elif [[ "$stack_description" == *"does not exist"* ]]; then
  stack_existed=false
else
  echo "unable to determine whether the production stack exists" >&2
  exit 1
fi

deploy_image() {
  local image_tag="$1"

  aws cloudformation deploy \
    --region "$AWS_DEFAULT_REGION" \
    --stack-name "$PRODUCTION_STACK_NAME" \
    --template-file "$TEMPLATE_FILE" \
    --no-fail-on-empty-changeset \
    --parameter-overrides \
      ProjectName="$PROJECT_NAME" \
      ImageTag="$image_tag" \
      CorsOrigins="$CORS_ORIGINS" \
    --tags \
      Project="$PROJECT_NAME" \
      Environment=production \
      ManagedBy=cloudformation
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

rollback_after_smoke_failure() {
  if [[ "$stack_existed" == "true" ]]; then
    echo "Smoke test failed; restoring previous image tag ${previous_image_tag}" >&2
    deploy_image "$previous_image_tag"
    aws ecs wait services-stable \
      --region "$AWS_DEFAULT_REGION" \
      --cluster "$ECS_CLUSTER_NAME" \
      --services "$ECS_SERVICE_NAME"
    return
  fi

  echo "Initial production smoke test failed; deleting the failed runtime stack" >&2
  aws cloudformation delete-stack \
    --region "$AWS_DEFAULT_REGION" \
    --stack-name "$PRODUCTION_STACK_NAME"
  aws cloudformation wait stack-delete-complete \
    --region "$AWS_DEFAULT_REGION" \
    --stack-name "$PRODUCTION_STACK_NAME"
}

deploy_image "$IMAGE_TAG"

aws ecs wait services-stable \
  --region "$AWS_DEFAULT_REGION" \
  --cluster "$ECS_CLUSTER_NAME" \
  --services "$ECS_SERVICE_NAME"

if ! smoke_test /healthz || ! smoke_test /readyz; then
  rollback_after_smoke_failure
  exit 1
fi

echo "Production deployment is stable and passed health/readiness smoke tests"
