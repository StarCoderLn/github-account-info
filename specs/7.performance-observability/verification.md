# Feature 7 云端验证记录

更新时间：2026-07-27（Asia/Shanghai）

## 已完成

- PR #22 已合并到 `master`，合并提交：
  `8fb51a413bc7f4b12c1e5965706084d8d451fb4b`。
- `github-account-info-performance-deployer-policy`：
  `CREATE_COMPLETE`。
- `github-account-info-performance`：
  `CREATE_COMPLETE`。
- 首次运行时 Change Set：
  `performance-runtime-30251992584`，审查参数
  `DesiredCount=0`、`ImageTag=prod-8fb51a413bc7f4b12c1e5965706084d8d451fb4b`。
- ECS Service `github-account-info-performance`：
  `ACTIVE`，`desired=0`、`running=0`、`pending=0`。
- 不可变 ECR 镜像已推送：
  `prod-8fb51a413bc7f4b12c1e5965706084d8d451fb4b`，
  digest `sha256:0005d103cbbc00c5eec161bb43de0fe96a5663361b812125dc30600dd4316bec`。
- Node Lambda 手工重新发布 run `30252625642`：Success。`live` alias 已晋级到
  version `7`，无附加 canary weight；只读核对确认
  `PERFORMANCE_QUEUE_URL` 指向本功能主队列。
- Cloudflare Pages production 已保存
  `VITE_PERFORMANCE_ENABLED=true`、`VITE_APP_ENVIRONMENT=production`、
  `VITE_APP_RELEASE=8fb51a4`。变量会在下一次 production 构建生效；processor
  尚为 0 时未手工重部署，避免提前持续写入队列。

GitHub Actions 证据：

| Run | 操作 | 结果 |
| --- | --- | --- |
| `30251725552` | 创建 deployer policy Change Set | Success |
| `30251838813` | 执行 deployer policy Change Set | Success |
| `30251992584` | 创建 DesiredCount=0 runtime Change Set | Success |
| `30252143585` | 执行 runtime Change Set | Success |
| `30252464818` | 测试、构建并推送 processor 镜像 | Success |
| `30252625642` | 重新发布 Node Lambda 并接入 Performance Queue | Success |

所有写操作均由 `github-actions-deployer` 的 GitHub OIDC 短期凭证完成。本机 AWS
root 凭证只用于 `describe-*` / `get-*` 只读核对。

自动 Lambda run `30251601982` 发生在 performance stack 创建前，空
`PerformanceQueueUrl` 被 SAM CLI 拒绝。stack 创建后重新发布已成功，不再是当前
故障。

## 后续验收

- 合并一次性 ECS migration 流程，更新 deployer policy 和 processor 镜像。
- 以 `DesiredCount=0` 更新 Task Definition 到新镜像，运行 `migrate-database`。
- 配置 Cloudflare Pages production SDK 变量。
- 短时将 processor 切到 `DesiredCount=1`，验证 API → SQS → ECS →
  CloudWatch/PostgreSQL → `/performance` 五指标。
- 验收后恢复 `DesiredCount=0`，再把本文件和 `tasks.md` 更新为最终事实。
