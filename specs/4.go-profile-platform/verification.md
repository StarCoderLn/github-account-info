# Go 个人主页与容器平台 — 完成审计矩阵

审计日期：2026-07-17

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
| F-024 | 已证明 | 首次真实 CodeBuild 在 PRE_BUILD 安全门失败且未写 ECR；第二次完成构建/ECR push 后在 POST_BUILD 权限门失败且未更新 ECS；修复 IAM 后第三次 build 全阶段成功，并完成 ECS stable wait 与 health/readiness smoke test。 |
| F-025 | 已证明 | production `prod-<sha>`、preview `pr-<number>-<40sha>` 约束与共享 preview key 测试。 |
| F-026 | 已证明 | PR #1/#2 最终 CodeBuild 均成功；两个 Stack、FARGATE_SPOT Service、Task Definition、Target Group、Listener Rule 与 `pr_1`/`pr_2` schema 并发存在，Service rollout completed、Target healthy。 |
| F-027 | 已证明 | PR template 只 import 共享 VPC/cluster/ECR/ALB/API/RDS foundation outputs。 |
| F-028 | 已证明 | 共享 preview key package、Vite 注入、public Go request header 与测试。 |
| F-029 | 已证明 | 两条真实 ALB rule 分别匹配独立 preview header + public path 并转发到不同 Target Group；两个 Header 请求均为 200 且响应哈希不同，无 Header 请求为 404。 |
| F-030 | 已证明 | schema 仅由受限 PR number生成，固定注入 `DB_SCHEMA=pr_<number>`；请求无 schema 参数。 |
| F-031 | 已证明 | 关闭 PR #1/#2 后两条 cleanup build 均成功；先删除 Service/Rule/TG，再以退出码 0 的 database Task 删除 `pr_1`/`pr_2`，最后删除两个 PR Stack。独立查询确认无 PR Service、priority 1/2 Rule、PR Target Group 或 PR Stack。 |
| F-032 | 已证明 | `ExpiresAt` tag、ECR 14 天 lifecycle、每日 EventBridge → NO_SOURCE TTL scanner → 已验收 cleanup build 均已部署；IAM Role 原地更新并保持四角色边界。手动空扫描 build 全阶段成功并明确报告没有 tagged preview Stack，且未启动新的 PR cleanup build。 |
| F-033 | 已证明 | Chrome 无痕窗口在 localStorage 为空、无 token/登录状态下访问 production `/u/StarCoderLn`，页面成功展示头像、账号资料、模板生成介绍及统计信息；公开读取不依赖应用认证。 |
| F-034 | 已证明 | 公网 `/internal` 实测 404；Lambda 已通过 Cloud Map private DNS 完成 generate、cache hit 与 Task IP 替换后的重新发现，公网 route 清单不含 `/internal/*`。 |
| F-035 | 已证明 | 所有管理型 tRPC 使用 `managementProcedure`，代码默认关闭且关闭测试通过；production 模板显式 opt-in，并由静态检查固定该兼容性决策及其非认证风险。 |
| F-036 | 已证明 | PAT 只在 Node request header/短生命周期 state；Go contract、日志、DB schema 和响应均无 PAT。 |
| F-037 | 已证明 | 云端 SG rule 已核对：Go Task 8080 入站来源恰好只有 Internal ALB SG 与 Lambda SG。 |
| F-038 | 已证明 | Preview Role 的 production 表读取权限先前已实测为 false；本轮两个 database Task 使用 preview Secret 成功创建/seed `pr_1`、`pr_2`，对应 Task 只注入各自 `DB_SCHEMA`，两个 API 响应独立。 |

## 非功能需求

| 要求 | 状态 | 证据 / 尚缺证据 |
| --- | --- | --- |
| 优雅关闭 | 已证明 | server shutdown 测试与容器 SIGTERM E2E。 |
| 查询/缓存性能 | 已证明 | login/unique index、introduction unique FK、source hash cache、GET 不生成。 |
| 可观测性 | 已证明 | JSON request log、API access log 与 runbook 已完成；ECS CPU/RunningTask、ALB unhealthy/target 5xx、API Gateway 5xx 共 5 个云端告警均已部署并实际进入 `OK`。 |
| Node/tRPC 兼容 | 已证明 | 类型检查和 Node tests 通过；部署后 Node root 与 `account.list` tRPC 均实测 200，API ID 未变化。 |
| Drizzle migration 单一所有权 | 已证明 | production tables 只由 Drizzle migration定义；Go 仅维护 preview 临时 schema DDL。 |
| 成本边界 | 已证明（资源侧） | 两个 PR 运行时均为 Fargate Spot 单副本；close 后计费型 Service/Target Group/Rule/Stack 均自动消失，ECR 14 天 lifecycle 已配置。真实账单金额仍以 AWS Billing 为准。 |

## 验收标准

| ID | 状态 | 所需最终证据 |
| --- | --- | --- |
| AC-001 | 已证明 | Go 自动化测试覆盖 health/ready/generate/GET/400/404/503。 |
| AC-002 | 已证明 | 本地 PostgreSQL 容器 E2E：existing login → generate → persist → public GET。 |
| AC-003 | 已证明 | Cloudflare Production 部署 `9f5cf939...`（commit `f73475d`）成功；Chrome 无痕窗口的 localStorage 为空，直接打开 `/u/StarCoderLn` 后完整展示已生成个人介绍，截图已由用户人工确认。 |
| AC-004 | 已证明 | non-root image inspect、rootfs 内容与 health E2E。 |
| AC-005 | 已证明 | 部署 route 清单恰好 7 条；Node/tRPC 200、Go health/ready 200、公开缺失用户 404、OPTIONS 204、`/internal` 404 均已实测。 |
| AC-006 | 已证明 | ALB `Scheme=internal`，Task 无 public IP，公网只暴露 API Gateway route；无 ALB 公网入口。 |
| AC-007 | 已证明 | Lambda Cloud Map 首次 generate 200、第二次 cache hit、公开 GET 200；Task IP 替换后 Cloud Map/ALB 新实例 healthy，Lambda 再次 cache hit。 |
| AC-008 | 已证明 | build #1/#2 失败时 stable task revision 保持 1；build #3 全阶段成功并将 ECS 切到 revision 2，rollout completed、failedTasks=0，health/readiness 200。 |
| AC-009 | 已证明 | PR #1/#2 使用不同 preview key、Target Group、FARGATE_SPOT Service 与 `pr_1`/`pr_2`；两次公开读取均 200、字段结构一致但响应 SHA-256 不同，无 Header 为 404；两个独立 Cloudflare Preview deployment 亦均成功并从公网返回 200。 |
| AC-010 | 已证明 | PR #1/#2 close cleanup build 均成功；Stack、Rule、Service、Target Group 与 `pr_1`/`pr_2` 被移除，production `/healthz` 继续返回 200。 |
| AC-011 | 已证明 | README/spec/infra 文档均以 Amazon RDS/标准 PostgreSQL 为当前 production；Neon 仅保留为历史迁移说明或脚手架元数据。 |

## 当前仍待完成事项

外部运行时证据、全部 acceptance criteria 与 T-1105 目标级完成审计均已完成；仅剩将 Stage 10/11 最终代码和本验收记录提交、推送到仓库，使版本库与已部署 AWS/Cloudflare 状态一致。
