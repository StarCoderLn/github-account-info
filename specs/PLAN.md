# 开发计划索引

## 本次 PRD（2026-06-27）切分为 3 个 feature

> 需求来源：`docs/prd.md`，本次仅实现 **需求 1（Hono 接口拉取 GitHub 账户信息）** 与 **需求 2（React + Tailwind 表单页 + Drizzle 增删改查）**。
> 需求 3（SAM 部署到 AWS / VPC）、需求 4（GitHub Actions + IAM 部署）由用户自行操作，不在本次 specs 范围内，后续以指导形式协助。

| 序号 | feature                | 说明                                              | 依赖 | 状态   |
| ---- | ---------------------- | ------------------------------------------------- | ---- | ------ |
| 1    | github-account-fetch   | Hono/tRPC 接口：用个人 PAT 拉取 GitHub 账户信息    | -    | ✅ 已完成 |
| 2    | account-records-api    | Drizzle `github_account` 表 + 增删改查 tRPC 接口   | -    | ✅ 已完成 |
| 3    | account-records-ui     | Token 管理 + 账号信息双页（v2 重构，见下方说明）   | 1, 2 | ✅ 已完成 |

## 平台扩展（2026-07-15）

| 序号 | feature | 说明 | 依赖 | 状态 |
| --- | --- | --- | --- | --- |
| 4 | go-profile-platform | Go 个人介绍生成/公开读取 API + ECS/Fargate + Internal ALB + VPC Link + Cloud Map + PR 独立环境 | 1, 2, 3 | 🚧 进行中 |

Feature 4 采用渐进迁移：Node Lambda 保留 GitHub PAT 与账号管理写入；Go 使用已经保存的 GitHub username/账号资料，通过 `template-v1` 规则生成并保存个人介绍，同时提供公开读取。详细需求、设计与任务见 `specs/4.go-profile-platform/`。

## 运行稳定性扩展（2026-07-22）

| 序号 | feature | 说明 | 依赖 | 状态 |
| --- | --- | --- | --- | --- |
| 5 | operational-resilience | Synthetics 巡检、SNS/SQS/DLQ 事件链路、Node 与 Go 灰度发布 | 4 | ✅ 已完成并通过云端验收 |

Feature 5 直接复用现有业务链路，不创建独立演示项目。详细需求、设计、完成项与云端验收步骤见 `specs/5.operational-resilience/`。

## AI 运维扩展（2026-07-24）

| 序号 | feature | 说明 | 依赖 | 状态 |
| --- | --- | --- | --- | --- |
| 6 | ai-ops-agent | CloudWatch 告警驱动的异步 AI 调查、证据聚合、根因建议与人工审批边界 | 5 | 🚧 进行中 |

Feature 6 继续复用当前 Turborepo 和既有 AWS 资源，不另建演示仓库。由于当前
AWS 账号不能使用 Amazon Bedrock，模型推理采用 Mastra + GitHub Models
免费原型额度；Agent 运行、事件触发、状态存储、IAM 与审计仍部署在 AWS。
详细需求、设计和执行任务见 `specs/6.ai-ops-agent/`。

## 性能可观测性扩展（2026-07-27）

| 序号 | feature | 说明 | 依赖 | 状态 |
| --- | --- | --- | --- | --- |
| 7 | performance-observability | 浏览器性能 SDK、SQS/ECS 日志清洗、PostgreSQL 分位数统计与五项 Web Vitals 页面 | 4, 5 | ✅ 代码侧 MVP 与部署准备完成；云端待验收 |

Feature 7 的公开采集路径固定为 `/api/v1/performance/events`。浏览器不持有 AWS
凭证；Node Lambda 只校验并写 SQS，独立 ECS processor 负责清洗、CloudWatch
日志和幂等入库。`/performance` 同时展示 LCP、INP、CLS、FCP、TTFB。
详细需求、设计和执行任务见 `specs/7.performance-observability/`。

**执行顺序**：1、2 并行完成 → 3 依赖 1/2 接口，已完成。

## 关键决策

- **表单与 token 接口关系**：Token 管理页添加 PAT 时验证并缓存账号信息；账号信息页优先从 DB 加载，DB 无记录时回退到 GitHub 拉取。
- **Token 存储**：PAT 完整值存于 localStorage（个人本地部署场景），供自动拉取和手动刷新使用。
- **数据表字段**：login、githubId、name、avatarUrl、bio、company、location、email、blog、twitterUsername、publicRepos、followers、following + 时间戳。（v2 新增 blog、twitterUsername）

## feature 3 v2 重构说明（2026-06-28）

原规划的 `/accounts` 单页 CRUD 表格方案调整为双页设计：

| 页面 | 路由 | 功能 |
| ---- | ---- | ---- |
| Token 管理 | `/` | 添加/删除 PAT，以账号卡片展示，点击进入编辑页 |
| 账号信息 | `/profile` | 查看/编辑账号数据，保存到数据库 |

## ID 编号约定

- 功能需求 / 任务 / 验收标准 ID **在单个 feature 内编号**，跨 feature 用 `{序号}.` 前缀区分。
- 例：`1.T-003` = 序号 1 这个 feature 的 T-003；`3.F-002` = 序号 3 的 F-002。
- **跨 feature 依赖**写全限定 ID，如 `3.T-004 依赖 1.T-003`、`3.T-005 依赖 2.T-004`。
