# Feature 5：运行稳定性与异步事件链路需求

## 目标

在现有 Node Lambda + Go ECS 项目上完成一条可演示、可验证的 AWS 运维链路，不扩展新的业务域：

1. CloudWatch Synthetics 定时检查 Node 根路由与 Go 健康/就绪路由。
2. 个人介绍生成成功后发布无凭证事件，经 SNS → SQS → Lambda 消费；连续失败进入 DLQ。
3. Node Lambda 与 Go 公网 API 都采用 10% → 100% 的灰度发布。

## 功能需求

- [F-001] Synthetics 必须检查 `/`、`/healthz`、`/readyz`，任一步骤非 200 或响应契约不符即失败。
- [F-002] Canary 产物写入私有、加密并带生命周期的 S3 bucket；失败指标形成 CloudWatch Alarm。
- [F-003] `introduction.generate` 成功后发布 `introduction.ready` 事件，事件不得包含 GitHub PAT、数据库连接串或介绍正文。
- [F-004] SNS 只可向指定 SQS queue 投递；consumer 使用 partial batch failure，单条坏消息不得重试整批。
- [F-005] consumer 必须通过公开 API 回读个人介绍，并核对 GitHub ID、username、生成器版本与生成时间。
- [F-006] 消息最多接收五次，之后进入保留 14 天的 DLQ；DLQ 非空与主队列积压均有告警。
- [F-007] Node Lambda 使用 `live` alias 原生附加权重执行 10%/5 分钟灰度，API Gateway 必须始终调用 alias。
- [F-008] Go production 使用独立 Canary Service：10% 公网流量观察 5 分钟后晋级稳定 Service，两个 Target Group 均纳入原有 ALB 告警，Cloud Map 只注册稳定 Service。
- [F-009] Node → Go 的 Cloud Map 私有 DNS 直连保持不变；该路径不承诺精确 10/90 分流。
- [F-010] 所有资源、目录与标签均按实际运行用途命名。

## 验收标准

- [AC-001] 新增事件 schema、publisher、consumer 的测试与类型检查通过。
- [AC-002] server、profile-events、synthetics、go-iam、go-production 模板均通过 `sam validate --lint`。
- [AC-003] `pnpm check:infra` 验证路由、IAM、监控和灰度边界。
- [AC-004] 云端部署后，Synthetics 三个 step 成功；向 SNS 投递不存在的合法测试 username，五次公开验证失败后消息进入 DLQ。
- [AC-005] 云端部署新 Node/Go 版本时，可在 Lambda alias 与 ALB ListenerRule 中观察 10% → 100% 流量变化。
