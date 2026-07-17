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

## Production 回滚

production image tag 不可变，ECS deployment circuit breaker 会自动回滚启动失败的 revision。若 smoke test 失败，CodeBuild 脚本也会恢复上一 image tag。人工处理时遵循：

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
