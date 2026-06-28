# 开发计划索引

## 本次 PRD（2026-06-27）切分为 3 个 feature

> 需求来源：`docs/prd.md`，本次仅实现 **需求 1（Hono 接口拉取 GitHub 账户信息）** 与 **需求 2（React + Tailwind 表单页 + Drizzle 增删改查）**。
> 需求 3（SAM 部署到 AWS / VPC）、需求 4（GitHub Actions + IAM 部署）由用户自行操作，不在本次 specs 范围内，后续以指导形式协助。

| 序号 | feature                | 说明                                              | 依赖 | 状态   |
| ---- | ---------------------- | ------------------------------------------------- | ---- | ------ |
| 1    | github-account-fetch   | Hono/tRPC 接口：用个人 PAT 拉取 GitHub 账户信息    | -    | ✅ 已完成 |
| 2    | account-records-api    | Drizzle `github_account` 表 + 增删改查 tRPC 接口   | -    | ✅ 已完成 |
| 3    | account-records-ui     | Token 管理 + 账号信息双页（v2 重构，见下方说明）   | 1, 2 | ✅ 已完成 |

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
