# Feature 5：运行稳定性与异步事件链路任务

## 开发

- [x] T-001：创建版本化、无凭证的个人介绍事件契约与单元测试。
- [x] T-002：在介绍生成成功后发布 SNS 事件，并实现未配置 Topic 时的本地 no-op。
- [x] T-003：实现 SQS publication verifier、公开 API 结果核对、partial batch failure、五次重试、DLQ 与队列告警。
- [x] T-004：实现 CloudWatch Synthetics 三步骤巡检、私有产物 bucket 与失败告警。
- [x] T-005：为 Node Lambda 配置原生 alias 权重 + 10%/5 分钟灰度，并确保 API Gateway 调用 alias。
- [x] T-006：为 Go production 配置稳定/Canary 双 Service、双 Target Group 与 10%/5 分钟公网灰度。
- [x] T-007：更新 IAM 静态边界检查、监控检查、项目规格和 Fumadocs。
- [x] T-008：删除已废弃的临时应用目录，并确认资源、目录和标签均按实际用途命名。

## 本地验证

- [x] T-101：events、consumer、api、server 的 test/check-types/build 全部通过。
- [x] T-102：相关六个 SAM/CloudFormation 模板通过 `sam validate --lint`。
- [x] T-103：`pnpm check:infra` 通过。

## 云端验收（用户执行部署后）

- [x] T-201：部署 profile-events stack，并把输出 Topic ARN 配给 server stack。
- [x] T-202：发布一条与现有公开介绍对应的真实事件，确认 SNS → SQS → publication verifier → 公开 API 链路成功。
- [x] T-203：向 SNS 投递一个不存在的合法测试 username，确认五次验证失败后进入 DLQ并触发告警。
- [x] T-204：部署 Synthetics，确认 Canary 自动启动且三个 step 均成功。
- [x] T-205：完成 Node 新版本 10% → 100% 灰度和 Go 同镜像 90/10 云端演练。

> 开发、本地验证和云端验收均已完成。DLQ 故障注入消息暂时保留用于控制台验收，清理前需再次确认。
