# AI Ops Agent

`ai-ops-agent` 是 `github-account-info` 项目专用的只读运维调查 Agent。它使用
Mastra 编排，通过 GitHub Models 完成推理，并从项目限定的 AWS 资源中收集证据。

它不是通用多项目运维平台，也不会自动执行修复。

## 架构

```text
CloudWatch Alarm
       │
       ▼
EventBridge → alarm-ingest Lambda → DynamoDB → SQS
                                                │
                                                ▼
                                      investigator Lambda
                                        ├─ GitHub Models
                                        ├─ CloudWatch Logs
                                        ├─ CloudWatch Alarms
                                        ├─ CloudFormation
                                        └─ SQS attributes
```

本应用包含两个 Lambda entrypoint：

- `alarm-ingest`：校验告警事件、按五分钟窗口去重、创建 incident 并入队。
- `investigate`：消费队列、调用只读工具和模型、校验结构化结果并更新 incident。

共享 incident、evidence 和 investigation schema 位于
`packages/ai-ops-schema`。

## 本地命令

项目需要使用 Node 24：

```bash
pnpm --filter ai-ops-agent check-types
pnpm --filter ai-ops-agent test
pnpm --filter ai-ops-agent build
```

这些命令不会连接真实 AWS 或 GitHub Models。单元测试使用 fake repository 和
fake investigator。

## 运行配置

```text
AWS_REGION
AI_OPS_INCIDENT_TABLE
GITHUB_MODELS_SECRET_ARN
AI_MODEL
NODE_API_LOG_GROUP
GO_API_LOG_GROUP
PROFILE_CONSUMER_LOG_GROUP
PROFILE_EVENTS_QUEUE_URL
PROFILE_EVENTS_DLQ_URL
```

GitHub Models token 只能保存在 Secrets Manager。Lambda 环境变量中只保存 Secret
ARN 和公开 model ID。

## 切换模型

在 GitHub Models catalog 内切换时，只需更新 CloudFormation 的 `AiModel` 参数，
无需修改 Agent、工具或共享 schema。目标 model ID 必须支持 tool calling 和
结构化输出。

切换到其他 provider 时，在 `src/model/` 新增 provider adapter，并继续向
`createMastraInvestigator` 传入 Mastra model 对象。AWS 调查工具、incident 状态机
和结构化输出协议不依赖具体 provider。

## 安全边界

- 工具输入只接受固定 component/queue enum，不接受任意 ARN、URL、shell 或日志
  查询语句。
- 日志在进入模型前进行脱敏和截断。
- 单次调查最多 4 个模型 step、6 次工具调用。
- 模型输出必须通过共享 Zod schema，并引用实际存在的 evidence ID。
- Agent 只能读取告警、日志、部署事件和队列 attributes。
- Agent role 不具备 ECS、Lambda、CloudFormation 或 SQS 修复写权限。
- remediation 只是待人工审批的建议，第一版不能自动执行。

## 2026-07-24 第一版复盘

### 技术决策

- 不另建仓库，而是在 Turborepo 中使用独立 app 隔离 Mastra 和 AWS SDK。
- 网络与存储边界放在 `packages/ai-ops-schema`。没有采用 `ops-contracts`，避免与
  Web3 合约概念混淆。
- AWS 账号没有 Bedrock 权限，因此第一版使用 Mastra + GitHub Models 免费额度。
  ChatGPT 会员不能替代模型 API token。
- Agent 是当前项目专用调查器。可复用部分是 incident 状态机、证据 schema、
  脱敏器、provider 接口和审批边界。

### 已实现

- 告警五分钟去重、DynamoDB TTL/PITR、SQS partial retry 和 DLQ。
- 服务告警状态、近期错误、近期部署和队列健康四类只读工具。
- GitHub Models provider 和 Secrets Manager secret loader。
- 日志凭证脱敏、结构化输出以及证据 ID 关联。
- tRPC `ops.list/get/create` 和 `/ops` 调查页面。
- SAM 模板、Node Server 可选参数/IAM 和静态安全边界检查。

### 保留边界

- 本地开发没有部署或修改 AWS 资源，也没有调用真实 GitHub Models。
- Node Server 的四个 `AiOps*` CloudFormation 参数默认为空。AI Ops 未部署时，
  原有功能保持不变，ops procedure 返回明确的未配置错误。
- 当前状态是“代码侧 MVP 和部署准备完成，云端部署与真实链路验收未完成”，不能
  将其描述为已经全部上线。

云端操作通过 `.github/workflows/ai-ops-change-set.yml` 使用现有 OIDC Role。该
workflow 仅手工触发，并把创建 Change Set 与执行 Change Set 分成不同操作；禁止
使用账号 root 完成日常部署。

### 模型与免费额度

- 默认模型为 `openai/gpt-4.1`，调用 GitHub Models inference API。
- 选择该模型是因为它支持 Agent 所需的 tool calling 和结构化输出。
- GitHub Models 免费 High 档模型当前限制为每分钟 10 次、每天 50 次请求；限额是
  外部平台规则，部署前后都要以 GitHub 官方页面显示为准。
- 单次调查最多 4 个模型 step，因此按最保守情况估算，每天约能完成 12 次完整调查；
  实际次数取决于每次调查使用的 step 数。
- 在 GitHub Models catalog 内换模型只改 `AiModel` 参数；换到其他 provider 时，
  增加 model adapter 即可，AWS 工具和 incident schema 无需重写。

### AWS 只读盘点

2026-07-24 使用当前 AWS 凭证完成了只读盘点，没有创建、修改或删除资源：

- 目标区域为 `us-east-2`。
- 已确认项目现有 CloudFormation stacks 状态稳定。
- 实际日志组为 `/aws/lambda/github-account-info-api`、
  `/ecs/github-account-info-go` 和
  `/aws/lambda/github-account-info-profile-event-consumer`。
- 已确认 profile events Queue/DLQ，可作为队列健康证据源。
- 账号当前已有 8 个 CloudWatch alarm；AI Ops stack 尚不存在，GitHub Models
  Secret 也尚未创建。
- `profile-events-dlq-not-empty` 当前处于 `ALARM`。EventBridge 通常只在告警状态
  发生变化时投递事件，因此部署后仍需单独做一次可控演练。

实际资源名已沉淀到本地忽略文件 `infra/parameters/ai-ops.local.json`；可提交的
示例位于 `infra/parameters/ai-ops.example.json`，不包含账号 ID、Secret ARN 或
token。

### 成本评估

本次按用户决定保留 Secrets Manager 方案，不在当前迭代改做降本重构。以低频作业
和 AWS 免费层仍可用为前提，预计 AI Ops 增量约为每月 0.40–0.50 美元：

- 主要固定项是 1 个 Secrets Manager secret，约 0.40 美元/月。
- 新增 2 个 CloudWatch alarm 后总数约为 10 个，通常仍在每月前 10 个标准 alarm
  的免费额度范围内。
- Lambda、SQS、EventBridge、DynamoDB 和 CloudWatch Logs 按量计费，低频时预计
  很小，但日志量、调查频率、免费层资格和区域价格变化都会使实际账单不同。
- GitHub Models 使用免费额度时不产生 AWS 模型推理费；超过 GitHub 限额时调查会
  失败或限流，不会自动切换到 Bedrock。

部署后必须设置 AWS Budget/告警并观察首周账单；上述数字是低流量估算，不是费用
上限或 AWS 账单承诺。

### 部署准备与权限边界

- 新增 `infra/ai-ops-deployer-policy.yaml`，用 Change Set 为现有
  `github-actions-deployer` 补充部署 AI Ops 所需的资源权限。
- 新增 `.github/workflows/ai-ops-change-set.yml`，只允许
  `workflow_dispatch`，支持创建/执行权限 Change Set、创建模型 Secret，以及
  创建/执行 Agent Change Set。
- Repository secret 名为 `AI_OPS_GITHUB_MODELS_TOKEN`；workflow 将其写入或更新到
  AWS Secrets Manager 的 `github-account-info/ai-ops/github-models-token`。
- 现有 OIDC role 的 GitHub subject 只信任 `master`，因此 workflow 必须在 PR
  合并到 `master` 后执行。
- 当前 AWS 连接身份是 root，但 root 只用于账号恢复和极少数 root-only 操作，不能
  用于日常部署。AI Ops 部署必须使用 GitHub Actions OIDC 的短期凭证。
- 现有 deployer role 已有多项宽权限 managed policies；本次只为完成 AI Ops 部署
  边界做记录，不在同一变更中重构其历史权限，避免影响现有部署。

推荐部署顺序：

1. 合并 PR 到 `master`，在 GitHub repository 配置
   `AI_OPS_GITHUB_MODELS_TOKEN`。
2. 手工运行 `create-policy-change-set`，审查后运行
   `execute-policy-change-set`。
3. 运行 `create-model-secret`。
4. 运行 `create-agent-change-set`，审查资源、IAM 和费用后运行
   `execute-agent-change-set`。
5. 将 AI Ops stack 输出接入 Node server stack，再通过 Change Set 部署。
6. 完成手工调查、告警状态变化、DLQ 和凭证泄漏检查。

### 最终验证

2026-07-24 已完成：

- `pnpm test`
- `pnpm check-types`
- `pnpm build`
- `pnpm check:infra`
- Agent 5 个单元测试
- AI Ops、Server 和 deployer policy SAM 模板校验
- workflow 静态边界校验（本机未安装 `actionlint`）

这些结果证明代码、类型、构建和静态基础设施边界通过，不代表真实 AWS/GitHub
Models 集成已经验收。

### 知识库编排

Fumadocs 知识库按需求开发顺序展示专题：

- 当前部署全景。
- 架构图总览。
- Node Lambda 部署。
- Go 服务部署。
- 稳定性与异步事件。
- AI Ops Agent。

首页快捷入口和左侧菜单先展示两个汇总入口，再按需求开发先后展示功能专题；
架构图总览内部按需求演进顺序排列各阶段图。所有可见入口不添加数字序号。AI Ops
的知识库页面只保留便于学习和复盘的摘要，本 README 仍是 Agent 实现、AWS 盘点、
费用与部署状态的详细记录。

### 踩坑

- Mastra 依赖当前 Node 运行时；本机系统 Node 14 太旧，项目命令需使用 Node 24。
- `tsx --test` 会创建 IPC pipe，在受限沙箱中可能出现 `listen EPERM`。允许本地
  IPC 后测试可以正常运行。
- Zod 4 不允许对包含 refinement 的 object schema 直接调用 `.omit()`。模型结论
  schema 需要显式组合，最终结果再通过完整的 `investigationSchema` 校验。
- AI 自由文本不能直接成为运维事实。程序必须先固定收集和脱敏 evidence，再校验
  模型结论。
- GitHub Actions OIDC role 的 trust policy 会限制分支；本项目当前只允许
  `master`，feature branch 上不能直接承担云端部署。
- CloudFormation 控制面权限不等于模板内资源权限。创建 Change Set 前要先独立
  补齐并审查 deployer policy，不能因为 role 有
  `AWSCloudFormationFullAccess` 就假定可以创建所有底层资源。
