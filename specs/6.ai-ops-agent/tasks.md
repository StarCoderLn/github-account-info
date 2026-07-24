# Feature 6：AI Ops Agent 任务

## 规格与边界

- [x] T-001：确认不创建独立仓库，Agent 作为当前 Turborepo 的独立 app。
- [x] T-002：确认使用 Mastra + GitHub Models，Bedrock/AgentCore 不在第一版范围。
- [x] T-003：定义只读调查闭环、人工审批边界、成本和凭证安全约定。
- [x] T-004：编写 requirements、design 和本任务清单。

## 共享领域模型

- [x] T-101：创建 `@github-account-info/ai-ops-schema` package。
- [x] T-102：实现 incident、investigation、evidence、remediation 和 queue event schema。
- [x] T-103：补充 schema 正反例、长度限制和敏感字段拒绝测试。

## Agent 应用

- [x] T-201：创建 `apps/ai-ops-agent` package、构建脚本和 Lambda handler。
- [x] T-202：实现资源目录、固定查询模板和统一脱敏器。
- [x] T-203：实现服务健康、近期错误、近期部署和队列健康只读工具。
- [x] T-204：实现 GitHub Models secret loader 和 Mastra provider。
- [x] T-205：实现 Agent 指令、结构化输出、模型/工具调用上限。
- [x] T-206：实现 DynamoDB repository 和条件状态迁移。
- [x] T-207：实现 SQS partial batch failure、暂时/永久错误分类和 JSON 日志。
- [x] T-208：使用 fake repository 和 fake investigator 完成 handler 单元测试；AWS adapter 由静态边界和类型检查覆盖。

## AWS 基础设施

- [x] T-301：创建 `infra/ai-ops.yaml` 的 DynamoDB、SQS 和 DLQ；生产者使用角色 IAM，无需开放 queue resource policy。
- [x] T-302：创建 CloudWatch Alarm → EventBridge → 归一化 Lambda → SQS rule。
- [x] T-303：创建 Agent Lambda、event source、log group、DLQ/queue age alarm。
- [x] T-304：创建资源收敛的 Agent Role 和 Node API 接入输出。
- [x] T-305：增加 AI Ops 静态边界验证并接入 `pnpm check:infra`。

## Node/tRPC 接入

- [x] T-401：扩展 server env，未配置 AI Ops 时保持显式 disabled。
- [x] T-402：实现 incident repository/queue service 的最小接口和 AWS adapter。
- [x] T-403：实现 `ops.list`、`ops.get`、`ops.create` router 与错误映射。
- [x] T-404：更新 server SAM 参数、环境变量和最小 IAM policy。
- [x] T-405：补充 service 配置与 disabled 边界单元测试。

## React 页面

- [x] T-501：新增 `/ops` 路由和导航入口。
- [x] T-502：实现调查列表、状态 badge、空状态和加载 skeleton。
- [x] T-503：实现调查详情、证据、根因、可信度与建议动作展示。
- [x] T-504：活动调查短轮询，结束后停止；创建成功后刷新列表。
- [x] T-505：保持后端类型由 `inferRouterOutputs<AppRouter>` 推导。

## 验证与文档

- [x] T-601：运行 schema、Agent、API 测试。
- [x] T-602：运行全仓库 check-types、build、test。
- [x] T-603：运行 SAM lint 和 `pnpm check:infra`。
- [x] T-604：更新根 README、infra README、RUNBOOK 和 Agent app README。
- [x] T-605：更新 `AGENTS.md` 项目踩坑与复盘笔记。
- [x] T-606：记录尚需用户执行的 Secret 创建、模型选择、Change Set 和云端演练步骤。

## 云端验收（用户审查并部署后）

### 部署准备

- [x] T-701：只读盘点 `us-east-2` 现有 stacks、日志组、Queue/DLQ 和 8 个 alarms，
  未修改 AWS 资源。
- [x] T-702：按实际 AWS 资源名修正参数示例，并用 ignored local 参数保存账号专属值。
- [x] T-703：选择支持 tool calling/结构化输出的 `openai/gpt-4.1`，记录免费额度和
  单次最多 4 step 的容量边界。
- [x] T-704：记录低频增量费用约 0.40–0.50 美元/月，保留 Secrets Manager 设计。
- [x] T-705：新增最小增量 deployer policy CloudFormation 模板。
- [x] T-706：新增仅手工触发的 OIDC workflow，将创建与执行 Change Set 分离。
- [x] T-707：验证 Agent 5 个测试、全仓 test/check-types/build、基础设施静态检查和
  三个 SAM 模板。

### 尚未完成

- [ ] T-711：创建仅含 `models:read` 的独立 GitHub Models token，并配置 GitHub
  repository secret `AI_OPS_GITHUB_MODELS_TOKEN`。
- [ ] T-712：PR 合并 `master` 后创建并审查 deployer policy Change Set。
- [ ] T-713：通过 workflow 创建 Secrets Manager secret。
- [ ] T-714：创建并审查 AI Ops stack Change Set，确认 Queue、DLQ、Table、Lambda、
  Rule、2 个 Alarm 和 IAM 后执行。
- [ ] T-715：把 stack 输出接入 Node server stack，并完成 Change Set 审查。
- [ ] T-716：手工创建调查，观察状态闭环和 GitHub Models 免费额度。
- [ ] T-717：通过可控的告警状态变化和 profile events DLQ 演练自动调查。
- [ ] T-718：检查 CloudWatch Logs、DynamoDB 和 API 响应中不存在凭证。
- [ ] T-719：部署后设置费用提醒并观察首周实际账单。
