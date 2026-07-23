# Feature 5：运行稳定性与异步事件链路设计

## 总体链路

```text
CloudWatch Synthetics ──HTTPS──> API Gateway
                                  ├── /            → Node Lambda alias
                                  └── /healthz     → VPC Link → ALB → Go ECS
                                      /readyz

introduction.generate → Node Lambda → SNS → SQS → publication verifier Lambda
                                               ├── GET public introduction API
                                               └── 5 次失败 → DLQ
```

## 事件契约

共享包 `@github-account-info/events` 定义版本化的 `introduction.ready` schema。事件只包含事件 ID、GitHub 公共标识、生成器版本、生成时间和本次是否新生成，不包含 PAT、介绍正文或其他凭证。事件 ID 由业务字段确定性生成，便于下游幂等处理。

Node publisher 仅在 `PROFILE_EVENTS_TOPIC_ARN` 存在时启用；本地环境没有 Topic 时保持 no-op。SNS 发布失败映射为语义化 `SERVICE_UNAVAILABLE`，不会把 AWS SDK 原始错误或凭证信息返回给客户端。

consumer 对每条 SQS record 独立校验，再通过公开 API 回读个人介绍，核对 GitHub ID、username、生成器版本与生成时间。只有事件契约和公开结果均匹配才确认消费；非法消息、HTTP 错误、超时或结果不一致只返回对应 record 的 `batchItemFailures`。同一消息五次失败后进入 DLQ。

## 灰度设计

Node 使用 `live` Lambda alias 作为 API Gateway 的唯一调用目标。`apps/server/deploy-canary.sh` 先发布不可变候选版本，再用 Lambda alias 原生 `AdditionalVersionWeights` 配置 90/10，观察 5 分钟后切换到新版本；账号不需要启用 CodeDeploy。

Go 使用稳定/Canary 两个 ECS Service。稳定 Service 保留 Cloud Map 与 Rolling；Canary Service 不注册 Cloud Map，平时为 0 个 Task，发布时通过备用 Target Group 承接 10% 公网流量。观察通过后稳定 Service 晋级，最后恢复 100/0。ALB unhealthy 与 target 5xx 告警聚合两组指标。

Cloud Map 是无权重的 DNS 服务发现，因此只让稳定 Service 注册。Node → Go 内部写调用不会进入公网 Canary；稳定版本晋级时仍由 ECS Rolling 保持健康 Task 连续可用。

## 部署边界

- `infra/profile-events.yaml` 独立拥有 SNS、SQS、DLQ、publication verifier 与队列告警；`PublicApiUrl` 参数提供公开 API origin。
- `infra/synthetics.yaml` 独立拥有 Canary、执行角色、产物 bucket 与失败告警，部署后默认按 15 分钟周期立即开始巡检。
- `infra/go-iam.yaml` 只允许 production CodeBuild 管理稳定/Canary 两个明确 ECS Service、对应 TaskDefinition 与 Target Group。
- `infra/server-deployer-policy.yaml` 只补齐 API access log 与 CloudWatch Alarm 管理权限，不授予 CodeDeploy API。
