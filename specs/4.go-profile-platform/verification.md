# Go 个人主页与容器平台 — 完成审计矩阵

审计日期：2026-07-16

状态定义：

- `已证明`：当前工作树中有直接代码、自动化测试或静态边界检查证据。
- `待云端验收`：IaC 已存在且本地校验通过，但需求描述的是实际 AWS 行为，不能用模板替代运行证据。
- `部分完成`：已有部分机制，但仍缺明确要求的一部分。
- `待人工验收`：必须通过真实浏览器或用户决策证明。

## 功能需求

| ID | 状态 | 权威证据 / 尚缺证据 |
| --- | --- | --- |
| F-001 | 已证明 | `router.go` health handler 与 `router_test.go`；不调用 DB。 |
| F-002 | 已证明 | ready handler 使用短超时 ping；成功/失败测试。 |
| F-003 | 已证明 | internal POST schema 只有 `githubUsername`/`regenerate`；Go 无 PAT 字段。 |
| F-004 | 已证明 | account repository 按 `github_account.login` 参数化查询并读取生成上下文；PostgreSQL E2E 已记录。 |
| F-005 | 已证明 | Drizzle `profile_introduction` migration、Go upsert/cache/regenerate 测试；production RDS 已于 2026-07-16 应用 migration，并只读验证表、约束、索引和 journal。 |
| F-006 | 已证明 | 公开 `GET /api/v1/github-users/{username}/introduction`；GET 不调用 generator。 |
| F-007 | 已证明 | zod/Go response contract 为 camelCase，公开 DTO 无 email、DB id、PAT/secret。 |
| F-008 | 已证明 | GitHub username validator 与 pgx 参数化 SQL；非法输入测试。 |
| F-009 | 已证明 | 400/404/503/500 映射及隐藏内部错误测试。 |
| F-010 | 已证明 | `IntroductionGenerator` interface 与 `template-v1`；无 AI SDK/外部生成调用。 |
| F-011 | 已证明 | config、pgxpool、HTTP/generation timeout、JSON logger、SIGTERM graceful shutdown 测试。 |
| F-012 | 已证明 | `/u/$username` 独立 REST client；代码不导入 token store。 |
| F-013 | 已证明 | 页面展示介绍、头像、姓名、username、公司、位置和统计。 |
| F-014 | 已证明 | 管理页 mutation → Node client → private Go POST；11 项 Node contract/边界测试。production 显式保留该能力。 |
| F-015 | 已证明 | loading、404、未生成、unavailable、retry UI 分支均存在；类型构建通过。 |
| F-016 | 已证明 | 公开页面只导入 introduction REST client，不调用 tRPC/account/internal endpoint。 |
| F-017 | 已证明 | digest-pinned multi-stage Dockerfile、`65532:65532`、镜像/rootfs 验收记录。 |
| F-018 | 已证明 | production ECS Service 实测 desired/running/pending=`1/1/0`，Task 位于两座 private subnet、无 public IP，rollout completed。 |
| F-019 | 已证明 | Internal ALB 实测 `Scheme=internal`，Target `10.0.2.84:8080` healthy，只有 API Gateway VPC Link/private VPC 链路可达。 |
| F-020 | 已证明 | VPC Link `AVAILABLE`；Go health/ready 200、公开缺失用户 JSON 404、Go OPTIONS 204，ECS 日志证明请求进入 target。 |
| F-021 | 已证明 | 部署后 `GET /` 与 `account.list` tRPC 均返回 200，API ID 未变化，Node/Lambda 原链路无回归。 |
| F-022 | 已证明 | Lambda 已通过 Cloud Map private DNS 成功 generate/cache hit；force new deployment 后 Task IP 从 `10.0.2.84` 变为 `10.0.3.90`，再次调用仍为 200/cache hit。 |
| F-023 | 已证明 | production Task 已从 Secret 启动并通过应用启动前 `pool.Ping`，Execution Role 的 production Secret 只读边界已云端核对。 |
| F-024 | 部分完成 | 首次真实 CodeBuild 在 PRE_BUILD 安全门失败且未写 ECR；第二次已完成测试、Docker build 与 ECR push，但 POST_BUILD 因缺少 `GetTemplateSummary` 被拒绝。两次均未更新 ECS；仍需一次成功 deploy/smoke log。 |
| F-025 | 已证明 | production `prod-<sha>`、preview `pr-<number>-<40sha>` 约束与共享 preview key 测试。 |
| F-026 | 待云端验收 | 参数化 PR Task Definitions/Service/TG/Rule/schema 已存在；需两个 PR 实例证据。 |
| F-027 | 已证明 | PR template 只 import 共享 VPC/cluster/ECR/ALB/API/RDS foundation outputs。 |
| F-028 | 已证明 | 共享 preview key package、Vite 注入、public Go request header 与测试。 |
| F-029 | 待云端验收 | ALB rule 同时匹配 header + public path，production rule 无 header；需真实分流测试。 |
| F-030 | 已证明 | schema 仅由受限 PR number生成，固定注入 `DB_SCHEMA=pr_<number>`；请求无 schema 参数。 |
| F-031 | 待云端验收 | close/merge buildspec 顺序静态验证通过；需真实 PR close 后资源消失证据。 |
| F-032 | 部分完成 | `ExpiresAt` tag 与 ECR 14 天 lifecycle 已完成；定时兜底触发器未实现。 |
| F-033 | 待人工验收 | 代码/API 无登录要求；仍需空 localStorage 的真实浏览器 AC-003。 |
| F-034 | 待云端验收 | `/internal` 不在 API route allowlist，Lambda client 使用 Cloud Map；需真实公网 404 与私网调用。 |
| F-035 | 已证明 | 所有管理型 tRPC 使用 `managementProcedure`，代码默认关闭且关闭测试通过；production 模板显式 opt-in，并由静态检查固定该兼容性决策及其非认证风险。 |
| F-036 | 已证明 | PAT 只在 Node request header/短生命周期 state；Go contract、日志、DB schema 和响应均无 PAT。 |
| F-037 | 已证明 | 云端 SG rule 已核对：Go Task 8080 入站来源恰好只有 Internal ALB SG 与 Lambda SG。 |
| F-038 | 待云端验收 | 独立 preview database Secret + 虚构 `preview-user` seed；需数据库权限和两个 schema 实测。 |

## 非功能需求

| 要求 | 状态 | 证据 / 尚缺证据 |
| --- | --- | --- |
| 优雅关闭 | 已证明 | server shutdown 测试与容器 SIGTERM E2E。 |
| 查询/缓存性能 | 已证明 | login/unique index、introduction unique FK、source hash cache、GET 不生成。 |
| 可观测性 | 部分完成 | JSON request log、API access log、ALB/ECS/API alarms 与 runbook 已完成；需云端产生并查看真实数据点。 |
| Node/tRPC 兼容 | 待云端验收 | 类型检查和 Node tests通过；需部署后 `/trpc/*` 调用。 |
| Drizzle migration 单一所有权 | 已证明 | production tables 只由 Drizzle migration定义；Go 仅维护 preview 临时 schema DDL。 |
| 成本边界 | 待云端验收 | PR Fargate Spot 单副本、close cleanup、ECR lifecycle 已配置；需真实账单/资源清理观察。 |

## 验收标准

| ID | 状态 | 所需最终证据 |
| --- | --- | --- |
| AC-001 | 已证明 | Go 自动化测试覆盖 health/ready/generate/GET/400/404/503。 |
| AC-002 | 已证明 | 本地 PostgreSQL 容器 E2E：existing login → generate → persist → public GET。 |
| AC-003 | 待人工验收 | 清空 token/localStorage 的浏览器打开 `/u/<seed username>` 并截图/记录响应。 |
| AC-004 | 已证明 | non-root image inspect、rootfs 内容与 health E2E。 |
| AC-005 | 已证明 | 部署 route 清单恰好 7 条；Node/tRPC 200、Go health/ready 200、公开缺失用户 404、OPTIONS 204、`/internal` 404 均已实测。 |
| AC-006 | 已证明 | ALB `Scheme=internal`，Task 无 public IP，公网只暴露 API Gateway route；无 ALB 公网入口。 |
| AC-007 | 已证明 | Lambda Cloud Map 首次 generate 200、第二次 cache hit、公开 GET 200；Task IP 替换后 Cloud Map/ALB 新实例 healthy，Lambda 再次 cache hit。 |
| AC-008 | 待云端验收 | 一次成功 CodeBuild + 一次故意失败且 stable task revision 不变。 |
| AC-009 | 待云端验收 | 两个并发 PR 的不同 preview key、Target Group、Service、schema 和不同 seed/update 结果。 |
| AC-010 | 待云端验收 | close PR 后 stack/rule/service/schema 消失，production health 保持 200。 |
| AC-011 | 已证明 | README/spec/infra 文档均以 Amazon RDS/标准 PostgreSQL 为当前 production；Neon 仅保留为历史迁移说明或脚手架元数据。 |

## 当前仍待完成的外部证据

1. foundation、IAM、production ECS runtime、VPC Link/API Gateway 与 CodeBuild projects/webhooks 均已于 2026-07-16 完成真实云端部署；production CodeBuild 已执行两次，T-902 构建与 ECR 推送已证明。只读 IAM 修复 Change Set 已执行并从实际 role policy 复核，T-903 仍待新提交重试。
2. Lambda → Cloud Map → Go 已完成首次生成、缓存命中、不可用降级与 Task IP 替换后的重新发现验收。
3. 两个真实 PR preview 与 close cleanup 尚未运行。
4. 空 localStorage 浏览器验收尚未执行。
5. F-032 的定时兜底触发器尚未决策；EventBridge → CodeBuild 需要额外窄权限 invocation role，或接受人工 TTL 审计不满足原始“定时”要求。
