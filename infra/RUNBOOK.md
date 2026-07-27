# Go 平台运行手册

本文用于 production 与 PR preview 环境的观察、定位和恢复。命令默认区域为 `us-east-2`，示例中的占位符必须替换；不要把 Secret、PAT 或数据库 URL 放进命令输出或故障记录。

## 告警与第一响应

| 告警 | 含义 | 第一检查点 |
| --- | --- | --- |
| `*-production-unhealthy-targets` | ALB 连续两分钟发现不健康 Go target | ECS deployment、task stopped reason、`/healthz` 日志 |
| `*-production-target-5xx` | Go target 连续两分钟返回 5xx | Go application log、RDS 连通性、最近 image tag |
| `*-production-no-running-task` | ECS service 两个采样点少于一个 running task | ECS events、镜像拉取、Secret 注入、子网出站 |
| `*-production-high-cpu` | 五分钟内至少三分钟 CPU 不低于 85% | 请求量、慢查询、task CPU；确认后再扩容 |
| `*-http-api-5xx` | API Gateway 连续两分钟出现 5xx | access log 的 routeKey/integrationError，再区分 Lambda 与 VPC Link |
| `github-account-info-performance-oldest-message` | 性能事件五分钟未清洗 | processor desired/running count、task 日志、RDS 和 SQS |
| `github-account-info-performance-dlq-not-empty` | 性能事件已耗尽五次重试 | 先分类永久/暂时错误，修复前不 redrive |

`AlarmTopicArn` 留空时告警仍会创建并在 CloudWatch Console 改变状态，但不会发通知。需要邮件或聊天通知时，先由用户创建并验证 SNS subscription，再把同一个 Topic ARN 作为 production 与 server stack 参数传入。CloudWatch Alarm、API Gateway detailed metrics 和 ECS Container Insights 都可能产生少量监控费用。

## 只读总览

```bash
aws cloudwatch describe-alarms \
  --region us-east-2 \
  --alarm-name-prefix github-account-info-go \
  --query 'MetricAlarms[].{Name:AlarmName,State:StateValue,Reason:StateReason}' \
  --output table

aws ecs describe-services \
  --region us-east-2 \
  --cluster github-account-info-go \
  --services github-account-info-go-production \
  --query 'services[0].{Running:runningCount,Pending:pendingCount,Desired:desiredCount,Deployments:deployments[*].{Status:status,Running:runningCount,Desired:desiredCount,TaskDefinition:taskDefinition},Events:events[0:5]}' \
  --output json
```

若 service 的 `Running` 为 0，先查停止任务，不要立即重复部署：

```bash
aws ecs list-tasks \
  --region us-east-2 \
  --cluster github-account-info-go \
  --service-name github-account-info-go-production \
  --desired-status STOPPED \
  --max-items 10
```

将返回的 task ARN 脱敏后逐个传给 `aws ecs describe-tasks`，重点看 `stopCode`、`stoppedReason` 和 container `reason`。常见分类：

- `CannotPullContainerError`：ECR/NAT/VPC endpoint、image tag 或 Execution Role。
- `ResourceInitializationError`：Secrets Manager、KMS、CloudWatch Logs 或私有子网出站。
- health check failed：确认端口 8080、Task SG、`/healthz` 与应用启动日志。
- application exit：只查看日志中的语义化错误，禁止输出 `DATABASE_URL`。

## API Gateway 与 ALB 分层定位

先调用公开端点并保留请求 ID：

```bash
curl --fail-with-body --silent --show-error \
  https://<api-id>.execute-api.us-east-2.amazonaws.com/healthz
```

判断路径：

1. API Gateway access log 出现 `integrationError`：检查 VPC Link 状态、Listener ARN 与 VPC Link SG 到 ALB SG 的 8080 规则。
2. API Gateway 成功但返回 Go 5xx：查看 ALB target 5xx 和 Go log。
3. ALB target unhealthy：检查 ECS task IP 是否注册、Task SG 是否只接受 ALB SG、容器是否监听 `0.0.0.0:8080`。
4. `/healthz` 正常但 `/readyz` 失败：进程存活，问题通常位于 RDS DNS、SG、TLS CA 或连接池。

生产 ALB 是 internal，不能从公网直接 curl。只通过 API Gateway 验证，或在 VPC 内受控诊断环境访问 ALB DNS。

## Cloud Map 与 Node → Go

公开 GET 走 API Gateway → VPC Link → Internal ALB；Node 的生成 mutation 走 Lambda → `go-api.github-account-info.local:8080`。后者失败而公开 GET 正常时，重点检查：

- production ECS Service 是否仍带 `ServiceRegistries`。
- Lambda 与 Go task 是否位于同一 VPC，Lambda SG 是否允许出站 8080。
- Cloud Map service 中注册的实例 IP 是否与当前 running task ENI 一致。
- Lambda 的 `GO_API_INTERNAL_URL` 是否仍为私有 DNS，且没有 `/internal` 公开路由。

## Node/SAM Stack 更新失败与 IAM 恢复

GitHub Actions 页面只显示 `Process completed with exit code 1` 时，不要从 warning 猜根因。先读 CloudFormation Events 中时间最早的具体 `*_FAILED` 资源；`Resource update cancelled` 通常只是连带结果。

本项目接入 API Gateway access log 与 5xx alarm 后，部署角色必须同时具备三层权限：

1. Log Group 标签/保留期：`logs:ListTagsForResource`、`TagResource`、`UntagResource`、`PutRetentionPolicy`。
2. Log Delivery：`logs:CreateLogDelivery`、`Get/Update/DeleteLogDelivery`、`PutResourcePolicy` 等；其中部分 API 只能使用 `Resource: "*"`。
3. CloudWatch Alarm：`cloudwatch:PutMetricAlarm`、`DeleteAlarms` 和标签权限。

权限事实来源是 `infra/server-deployer-policy.yaml`；不要再通过 Console 逐条扩大 inline policy，也不要附加 `CloudWatchFullAccess`。如果 Stack 已进入 `UPDATE_ROLLBACK_FAILED`：

```bash
aws cloudformation describe-stack-events \
  --region us-east-2 \
  --stack-name github-account-info \
  --max-items 30

aws cloudformation continue-update-rollback \
  --region us-east-2 \
  --stack-name github-account-info

aws cloudformation wait stack-rollback-complete \
  --region us-east-2 \
  --stack-name github-account-info
```

必须等到 `UPDATE_ROLLBACK_COMPLETE` 才能重新运行 `Deploy Lambda`。`continue-update-rollback` 只恢复上一稳定版本，不会自动重新应用失败的更新；恢复后仍需重跑 workflow。最终验收至少包含 Stack `UPDATE_COMPLETE`、Lambda `Active/Successful`、VPC Link `AVAILABLE`、Alarm `OK`，以及 Node root、`/healthz`、`/readyz` 均为 200。

## Production 回滚

production image tag 不可变。独立 Canary Service 会先接收 10% 公网流量并观察 5 分钟；稳定 Service 的 Cloud Map 链路保持 Rolling。若部署或 smoke test 失败，发布脚本恢复上一 image tag、稳定流量 100% 并把 Canary 缩容为 0。人工处理时遵循：

1. 在 CodeBuild/ECS Console 记录失败 build ID、新旧 image tag 和 deployment event。
2. 确认上一 revision 曾稳定运行，不重新标记或覆盖 ECR tag。
3. 使用 CloudFormation/既有 production 部署脚本把 `ImageTag` 恢复为上一 `prod-<sha>`。
4. 等待 `aws ecs wait services-stable`，再验证 `/healthz`、`/readyz` 和一个公开 introduction GET。
5. 不用 Console 直接改 Task Definition 环境变量，避免 CloudFormation drift。

## PR preview 清理审计

PR close/merge 的正常顺序是：移除 listener rule 和 Service → drop 精确 `pr_<number>` schema → 删除 PR stack。任何一步失败都先停止，不手工扩大删除范围。

只读盘点带 TTL tag 的 PR stack：

```bash
aws cloudformation describe-stacks \
  --region us-east-2 \
  --query 'Stacks[?contains(StackName, `github-account-info-go-pr-`)].{Stack:StackName,Status:StackStatus,Tags:Tags}' \
  --output json
```

EventBridge 默认每天 03:00 UTC 启动 `${ProjectName}-preview-ttl-cleanup`。scanner 为 `NO_SOURCE`、非 privileged CodeBuild，只读取同时带 `Project`、`Environment=preview` 标签的 CloudFormation Stack；严格验证 Stack 名称、PR number 与 `ExpiresAt` 后，通过既有 preview build 的 `PULL_REQUEST_CLOSED` 路径执行相同的安全清理。若 scanner 失败，在 `/aws/codebuild/${ProjectName}-preview` 的 `ttl-cleanup` stream 查看日志；不要绕过 schema confirmation 直接删除数据库对象。

preview Task Definition 使用 `Retain`，因为 `ecs:DeregisterTaskDefinition` 不能按资源 ARN安全收紧。它们不运行、不产生 Fargate 费用，但会占 task definition revision 配额。每月仍应按 `Project`、`Environment=preview` 和 `ExpiresAt` tag 做一次只读审计；实际注销必须由可信管理员执行，不能给会执行 PR 源码的 Preview CodeBuild Role 增加通配注销权限。

## 日志与数据安全

- API Gateway access log 只记录 request ID、route、status、response length 与 integration error。
- Go log 可记录 request ID、路径模板、状态和耗时，不记录请求凭证或数据库 URL。
- GitHub PAT 只存在于请求头和短生命周期前端 state；不得进入 Go、CodeBuild、CloudWatch 或故障工单。
- preview 只使用独立 database credential 和虚构 seed。per-PR schema 是可信协作者的功能隔离，不是恶意多租户安全边界。

## AI Ops Agent

调查路径为 CloudWatch Alarm → EventBridge → alarm-ingest Lambda → SQS →
investigator Lambda → DynamoDB。`/ops` 仅从 DynamoDB 查询结果，不同步等待模型。

排障顺序：

1. 没有 incident：检查 EventBridge rule metrics 和 alarm-ingest log。
2. incident 停在 `queued`：检查 AI Ops queue 可见消息、event source mapping 和
   investigator reserved concurrency。
3. incident 停在 `investigating`：检查 GitHub Models 429/5xx、Secret ARN 与
   `models:read` 权限；不要输出 Secret value。
4. 消息进入 AI Ops DLQ：修复根因后只 redrive 精确消息，不 purge 整条队列。
5. `INVALID_MODEL_OUTPUT`：保留 evidence 与 model ID，调整 schema/prompt 后重新
   创建调查；不得跳过 Zod 校验直接保存自由文本。

Agent role 不含 ECS/Lambda/CloudFormation/SQS 写操作。任何建议都只是待人工审批
的数据；若未来增加执行能力，必须使用独立 role、白名单动作和新的 change set，
不能扩展当前 investigator role。

## Performance SDK 与清洗链路

链路为浏览器 → `POST /api/v1/performance/events` → Node Lambda → SQS → 独立 ECS
processor → CloudWatch/PostgreSQL。排障按层进行：

成本边界：processor 的 scalable target 为 `MinCapacity=0`、`MaxCapacity=1`。
SQS 出现可见消息后 scale-out alarm 将 Service 从 0 扩到 1；可见与处理中消息之和
连续 3 分钟为 0 后 scale-in alarm 恢复到 0。当前 production stack 在该 Change
Set 部署前仍是手动 `DesiredCount=0`，不能把本地模板状态当成线上已生效。禁止
直接 `aws ecs update-service`，否则会造成 CloudFormation/Application Auto
Scaling 状态漂移。

1. 浏览器没有请求：确认 production 构建变量
   `VITE_PERFORMANCE_ENABLED=true`，且 SDK 在 idle 阶段初始化。
2. API 返回 503 `PERFORMANCE_INGEST_DISABLED`：performance stack 不存在，或 Node
   stack 尚未接入完整 Queue URL/ARN。
3. API 返回 202 但队列没有消息：检查 Lambda Role 是否仅对实际 queue ARN 拥有
   `sqs:SendMessage`，不要扩大为 `sqs:*`。
4. 队列积压：先检查 `queue-scale-out` alarm、scalable target 和 scaling
   activity，再检查 ECS Service desired/running count、停止原因、SQS HTTPS
   出站和 `/ecs/github-account-info-performance` 日志。
5. processor 报数据库失败：检查 Secret 注入、RDS SG 5432 和迁移；禁止打印
   `DATABASE_URL`。
6. CloudWatch 有清洗日志但页面为空：检查 `performance_event` 数据时间、environment
   筛选和 Node Lambda 的数据库连接。

生产迁移只通过 `Performance Change Set` workflow 的 `migrate-database` 操作执行。
该操作复用当前 Task Definition 和 private network，覆盖容器变量为
`PERFORMANCE_PROCESSOR_MODE=migrate`，运行仓库内全部 Drizzle migration 后退出。
工作流必须等待 task `STOPPED` 且容器 exit code 为 0；失败或取消时只停止该次
精确 task。禁止在 GitHub runner 展开数据库 Secret，也禁止用本机 root 凭证开
SSM 隧道代替正式迁移流程。

只读检查：

```bash
aws sqs get-queue-attributes \
  --region us-east-2 \
  --queue-url <PERFORMANCE_QUEUE_URL> \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible

aws ecs describe-services \
  --region us-east-2 \
  --cluster github-account-info-go \
  --services github-account-info-performance \
  --query 'services[0].{Desired:desiredCount,Running:runningCount,Pending:pendingCount,Events:events[0:5]}'

aws application-autoscaling describe-scaling-activities \
  --region us-east-2 \
  --service-namespace ecs \
  --resource-id service/github-account-info-go/github-account-info-performance \
  --scalable-dimension ecs:service:DesiredCount \
  --max-results 10
```

测试 DLQ 时使用契约合法但数据库暂时不可用的受控环境；查看主队列消息会改变
receive count 和 visibility。永久非法事件会被 processor 明确拒绝并确认消费，
不会进入 DLQ。
