# Feature 6：AI Ops Agent 需求

## 背景

Feature 5 已经完成 CloudWatch Synthetics、CloudWatch Alarm、SNS/SQS/DLQ、
Node Lambda 与 Go ECS 灰度发布。Feature 6 不再创建一套新的监控平台，而是在
这些已有运维信号之上实现一个项目专用的 AI Ops Agent。

当前 AWS 账号无法使用 Amazon Bedrock，因此模型推理使用 GitHub Models 的免费
原型额度。GitHub Models token 只保存在 AWS Secrets Manager，Agent 的运行、
告警触发、事件队列、调查状态、IAM 和审计仍全部位于 AWS。

## 目标

1. CloudWatch Alarm 进入 `ALARM` 后自动创建并排队一条调查。
2. 管理页面可以手工创建调查并查看进度与结果。
3. Agent 使用项目限定的只读工具收集告警、日志、ECS、Lambda 和 SQS 证据。
4. Agent 输出通过 Zod 校验的结构化根因分析，不返回自由格式的不可审计文本。
5. 调查结果持久化到 DynamoDB，并保留模型、证据、工具轨迹和失败分类。
6. 第一版建立人工审批和白名单修复的数据边界，但不开放任意 AWS 写操作。

## 功能需求

- [ ] F-001：共享包 `@github-account-info/ai-ops-schema` 必须定义版本化的
  incident、investigation、evidence 和 remediation Zod schema。
- [ ] F-002：CloudWatch `ALARM` state change 必须经 EventBridge 投递到专用
  SQS queue；主队列连续失败五次后进入保留 14 天的 DLQ。
- [ ] F-003：手工调查必须先写入 DynamoDB，再发送只包含 `incidentId` 的 SQS
  消息；不得把 token、日志正文或模型 prompt 放入队列。
- [ ] F-004：同一告警在五分钟去重窗口内只能存在一个活动调查，避免告警风暴
  重复消耗免费模型额度。
- [ ] F-005：Agent 必须使用 Mastra 和可替换的 model provider；第一版 provider
  为 GitHub Models，model ID 由环境变量配置。
- [ ] F-006：GitHub Models token 必须从 Secrets Manager 获取，不得写入模板、
  参数文件、Lambda 环境变量明文、日志或 API 响应。
- [ ] F-007：Agent 工具必须使用明确的 Zod 输入，不提供任意 AWS API、任意
  CloudWatch Logs Insights 查询、任意 URL 或 shell 执行能力。
- [ ] F-008：第一版至少提供服务健康、近期错误、近期部署和队列健康四类只读证据。
- [ ] F-009：日志工具必须使用固定查询模板、固定最大时间窗口和结果上限，并在
  进入模型前删除 token、Authorization、数据库 URL 和常见凭证格式。
- [ ] F-010：调查输出至少包含摘要、严重度、根因、可信度、证据、矛盾证据和
  建议动作；所有输出必须通过共享 schema 校验。
- [ ] F-011：模型限额必须固定：单次调查最多四次模型请求、六次工具调用；
  Agent Lambda 不占用账号 reserved concurrency；SQS event source 的
  `MaximumConcurrency` 固定为 2、`BatchSize` 固定为 1。
- [ ] F-012：GitHub Models 429/5xx、工具暂时失败和 Lambda 超时必须保留为可重试
  失败；schema 无效、事件非法等永久错误必须记录后确认消费，避免毒消息循环。
- [ ] F-013：前端 `/ops` 页面必须显示调查列表、状态、证据、根因、可信度和建议，
  并区分“Agent 判断”和“AWS 原始证据”。
- [ ] F-014：审批接口只能审批已存在的白名单动作；第一版不得允许模型直接执行
  ECS、Lambda、CloudFormation、SQS redrive 或 shell 写操作。
- [ ] F-015：Agent、队列、DynamoDB、Secrets Manager 访问和 CloudWatch Logs
  必须使用独立、资源收敛的 IAM 权限。

## 非功能需求

- [ ] NF-001：Agent Lambda 不进入 VPC；它只访问公网模型 HTTPS API和 AWS API，
  避免为模型调用引入 NAT 依赖和费用。
- [ ] NF-002：DynamoDB 使用按需容量和 TTL；调查默认保留 30 天。
- [ ] NF-003：Agent 日志采用 JSON，记录 incident ID、阶段、错误名和耗时，不记录
  prompt、完整模型响应、token 或原始日志正文。
- [ ] NF-004：工具和存储通过最小接口注入，单元测试不得访问真实 AWS 或模型。
- [ ] NF-005：所有可部署单元保留在 `apps/`，共享运行时 schema 保留在
  `packages/`，不通过相对路径跨 package 读取源码。
- [ ] NF-006：模型 provider 必须可替换，未来切换 Gemini、付费 GitHub Models
  或 Bedrock 时不修改调查领域模型和 AWS 工具。

## 第一版不做

- 通用多项目、多账号或多租户 AI Ops 平台。
- Bedrock、AgentCore、OpenSearch、向量数据库或知识库。
- 多 Agent swarm。
- Slack、邮件、Jira 等外部工单集成。
- 自建 GPU/EC2 模型。
- 任意 shell、任意 HTTP、任意 Logs Insights 查询。
- 未经审批的自动修复。
- 自动删除 DLQ、Stack、数据库或日志。

## 验收标准

- [ ] AC-001：共享 schema、事件归一化、去重、脱敏、工具和 handler 单元测试通过。
- [ ] AC-002：`pnpm test`、`pnpm check-types`、`pnpm build` 通过。
- [ ] AC-003：`infra/ai-ops.yaml` 通过 `sam validate --lint`，静态边界检查通过。
- [ ] AC-004：手工创建调查后可以观察到
  `queued → investigating → completed/failed` 状态变化。
- [ ] AC-005：DLQ 告警演练能自动创建调查，结果能识别队列积压、公开验证失败和
  相关 Lambda 错误证据。
- [ ] AC-006：GitHub Models 暂时限流时消息按队列策略重试，不产生重复 incident。
- [ ] AC-007：日志和 API 响应中搜索不到 GitHub Models token、GitHub PAT 或
  `DATABASE_URL`。
- [ ] AC-008：没有已批准的白名单 remediation 时，Agent 执行角色无法修改任何
  ECS、Lambda、SQS 或 CloudFormation 资源。
