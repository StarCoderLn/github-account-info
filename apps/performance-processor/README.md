# Performance Processor

该应用是 Feature 7 的独立 ECS Fargate 清洗服务。它通过 20 秒长轮询消费
`github-account-info-performance-events`，再次校验共享 schema，归一化 route、
脱敏错误文本并使用 `event_id` 幂等写入 PostgreSQL。清洗后的事件以单行 JSON
输出，由 ECS `awslogs` 写入 `/ecs/github-account-info-performance`。

## 本地命令

```bash
corepack pnpm --filter performance-processor test
corepack pnpm --filter performance-processor check-types
corepack pnpm --filter performance-processor build
```

运行时变量：

| 变量 | 说明 |
| --- | --- |
| `AWS_REGION` | SQS 所在区域，默认 `us-east-2` |
| `PERFORMANCE_PROCESSOR_MODE` | `processor`（默认）或一次性 `migrate` |
| `PERFORMANCE_QUEUE_URL` | 只允许消费的主队列 URL |
| `DATABASE_URL` | 由 ECS Secrets 注入，不写模板或日志 |
| `RDS_CA_BUNDLE` | RDS CA 文件，镜像内默认 `/app/certs/rds-bundle.pem` |
| `POLL_WAIT_SECONDS` | 长轮询时间，默认 20 |
| `VISIBILITY_TIMEOUT_SECONDS` | 单条消息可见性超时，默认 120 |

## 错误语义

- JSON/schema/时间窗非法：永久错误，记录稳定原因后删除消息。
- PostgreSQL、SQS 或未知运行时错误：暂时错误，不删除消息，等待重试/DLQ。
- 重复 `eventId`：正常幂等结果，`ON CONFLICT DO NOTHING`，不是错误。

服务不会记录 SQS body、数据库 URL、IP、User-Agent、Authorization 或 Cookie。
processor 启动后及每 24 小时执行一次明确的 7 天保留清理；清理失败一小时后重试，
不会扩大删除表或其他业务数据。

## 镜像和首次部署

`infra/performance.yaml` 首次使用 `DesiredCount=0` 创建 ECR、Queue 和角色。随后：

1. 使用提交 SHA 构建 `prod-<sha>` 镜像。
2. 推送到 stack 输出的 `PerformanceRepositoryUri`。
3. 审查 UPDATE Change Set，把相同 `ImageTag` 和 `DesiredCount=0` 传入。
4. 通过 workflow 的 `migrate-database` 启动一次性 Fargate Task；迁移使用镜像内
   `/app/migrations`、RDS CA 和 ECS Secret，成功后 exit code 为 0。
5. 更新后的 stack 使用 Application Auto Scaling 管理 `DesiredCount`：队列出现
   可见消息后从 0 扩到 1，可见与处理中消息连续排空 3 分钟后缩回 0。
6. 首次部署或自动伸缩验收仍必须通过 reviewed Change Set；不要直接运行
   `aws ecs update-service`，避免 CloudFormation 与 scalable target 状态漂移。

构建上下文必须是仓库根目录：

```bash
docker build -f apps/performance-processor/Dockerfile .
```
