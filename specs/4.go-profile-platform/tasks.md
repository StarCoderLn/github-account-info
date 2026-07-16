# Go 个人主页与容器平台 — 任务清单

## 任务版本

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-07-15 | v1 | 初始分阶段任务 |
| 2026-07-16 | v2 | 完成阶段 4 容器构建、运行、安全与本地 PostgreSQL E2E 验收 |
| 2026-07-16 | v3 | 阶段 10 收敛为四角色、独立 preview database 与 PR 自动生命周期 |

## 项目信息

- 项目名：github-account-info
- specs 路径：`specs/4.go-profile-platform/`
- 目标架构：API Gateway → VPC Link → Internal ALB → ECS/Fargate Go

## 阶段 5 之后的协作方式

从阶段 5 开始采用“Codex 指导、用户操作、共同验收”的方式：

- Codex 负责准备和审查 CloudFormation/buildspec、解释每个 AWS 资源与权限、给出逐步控制台/CLI 操作和验收命令。
- 用户亲自执行所有会改变 AWS 状态、创建收费资源、部署服务或删除资源的操作。
- 每个操作批次开始前，Codex 先说明目的、预期变化、费用/安全影响、回滚方法和验证标准。
- 用户只回传资源状态、ARN/ID、事件或脱敏日志；数据库密码、Secret 值、PAT、Cloudflare token 等不得粘贴到对话或命令输出。
- Codex 根据用户回传的权威结果核验，通过后才勾选对应任务并指导下一步。
- 基础设施仍以 IaC 为事实来源；用户执行 change set/deploy，并在 AWS Console 中观察资源关系，不采用无法复现的纯手工生产配置。

## 阶段 0：规格与安全边界

- [x] T-001：盘点现有 Cloudflare、API Gateway、Lambda、RDS、SAM 与 GitHub Actions 架构。
- [x] T-002：确认采用方案 C，Internal ALB 不暴露公网。
- [x] T-003：确认 Go 的核心是复用现有 GitHub username/账号资料生成新的 introduction，而非简单展示 profile。
- [x] T-004：冻结 Node/Go 边界：Node 保留 PAT/账号写入，Go 生成并保存 introduction；Drizzle 保持 migration 单一所有权。
- [x] T-005：定义 production/PR 资源模型、四个隔离 IAM Role 与验收门槛。
- [x] T-006：部署前确认管理端使用 Cloudflare Access，或改为 production 只读。
- [x] T-007：确认第一版使用 Go 规则模板生成，不调用 AI；保留 generator interface。

## 阶段 1：Go 工具链与 monorepo

- [x] T-101：安装并验证本地 Go toolchain（Go 1.26.5）。
- [x] T-102：创建 `apps/go-api` Go module 与目录骨架。
- [x] T-103：添加 Go app 的 package task adapter 并接入 Turborepo。
- [x] T-104：将根 Turbo 脚本改为 `turbo run` 标准形式，配置 Go build/test 输出。

## 阶段 2：Go REST API

- [x] T-201：实现启动配置校验、logger、HTTP server 与优雅关闭。
- [x] T-202：实现 pgxpool 创建、ping 与关闭，保护数据库凭证。
- [x] T-203：实现 account context repository，将领域参数 username 映射为对现有 `login` 列的参数化查询。
- [x] T-204：实现 introduction repository、source hash、upsert 与 Drizzle `profile_introduction` migration。
- [x] T-205：定义 IntroductionGenerator interface，并实现稳定、可测试的 `template-v1` generator。
- [x] T-206：实现 `/healthz`、`/readyz`、`POST /internal/v1/introductions` 与 `GET /api/v1/github-users/{username}/introduction`。
- [x] T-207：实现 input validation、错误分类、request ID、generation timeout 与 CORS。
- [x] T-208：覆盖 generate/cache/regenerate、公开读取、400、404、503、500 和 shutdown 测试。

## 阶段 3：React 公开主页

- [x] T-301：新增公开 introduction REST client 与 zod response validation。
- [x] T-302：新增 Node `introduction.generate` tRPC mutation 与 Cloud Map Go client contract。
- [x] T-303：在管理页增加生成/重新生成操作和状态反馈。
- [x] T-304：新增 `/u/$username` 路由，以生成内容为核心展示个人介绍。
- [x] T-305：实现尚未生成、生成中、loading、404、retry、service unavailable 状态。
- [x] T-306：确认公开页面无 PAT/localStorage 依赖，email 默认不展示。
- [ ] T-307：完成前端类型检查、构建与浏览器联调。

T-307 当前状态：类型检查及 `server`、`web`、`go-api` production build 已通过；本地 PostgreSQL + Go 容器的 generate/read API E2E 已通过。真实浏览器在无 token、空 localStorage 下的 `/u/$username` 联调尚未执行，因此本项保持未完成。

## 阶段 4：容器化

- [x] T-400：安装并验证 Docker 运行环境。
- [x] T-401：添加多阶段、固定版本、非 root Dockerfile。
- [x] T-402：添加 `.dockerignore`，验证镜像无 `.env`/源码凭证。
- [x] T-403：加入 RDS CA 与 TLS 配置。
- [x] T-404：本地构建/运行镜像并验证 health/generate/introduction read/shutdown。

阶段 4 验收记录（2026-07-16）：

- Docker CLI 29.6.1、Colima 0.10.3 与 Buildx 0.35.0 已安装并验证；Docker Server 29.5.2 运行于 Linux/amd64。
- `linux/amd64` 镜像构建成功；运行配置为 `USER 65532:65532`，导出 rootfs 只包含 Go 二进制与 RDS CA，不包含源码、`.env`、shell、编译器或包管理器。
- 对临时 PostgreSQL 17 容器应用全部 Drizzle migrations，并以已有 `github_account.login=octocat` 数据验证 404 → generate → public read → cache hit → regenerate；生成内容与 64 字符 source hash 已落盘。
- `/healthz`、`/readyz` 返回 200，受控 Origin 的 CORS preflight 返回 204；SIGTERM 后记录 `go api stopped` 且退出码为 0。
- 生产模式即使连接串带 `sslmode=disable` 仍强制 `verify-full`；面对无 TLS 的临时数据库以通用错误退出码 1 失败关闭，日志未泄露连接串。

## 阶段 5：共享 AWS 基础设施

- [x] T-501：编写 ECR、lifecycle policy 与 CloudWatch Log Group CloudFormation。
- [x] T-502：编写 ECS Cluster、Cloud Map namespace/service。
- [x] T-503：编写 Internal ALB、listener 与各层 security groups。
- [x] T-504：编写 production/preview 各自的 CodeBuild、Execution 四个 IAM Role 最小权限；Go 不调用 AWS API，省略空 Task Role。
- [x] T-505：编写 Secrets Manager 引用与生产参数 contract。
- [x] T-506：validate/template lint/change set 审查后，经用户批准创建资源。

阶段 5 云端验收（2026-07-16）：`github-account-info-go-foundation` 与 `github-account-info-go-iam` 均为 `CREATE_COMPLETE`。foundation 已创建 ECR、ECS Cluster、Cloud Map、Internal ALB、Log Group 与分层 Security Group，但未启动 Fargate Task；IAM stack 的资源清单恰好只有 production/preview 各自的 CodeBuild Role 与 ECS Execution Role 共四个 `AWS::IAM::Role`。两个 stack 只引用 Secret ARN，不输出或保存 Secret value。

## 阶段 6：生产 ECS/Fargate

- [ ] T-601：构建并推送首个 SHA-tagged ECR image。
- [ ] T-602：创建 production Task Definition、Target Group 与 ECS Service。
- [ ] T-603：配置 private subnets、security groups、secret injection 与 Cloud Map registration。
- [ ] T-604：验证 task healthy、ALB VPC 内访问、RDS 查询与 CloudWatch logs。
- [ ] T-605：验证 Internal ALB 无公网可达路径。

阶段 6 准备状态（2026-07-16）：`infra/go-production.yaml` 已编写并通过 `sam validate --lint`，包含不可变 `prod-<sha>` image、非 root/只读 rootfs Task Definition、production Target Group/path rule、Fargate Service、私有子网、Secret 注入和 Cloud Map registration。Go 的 gofmt、module verify、vet、test 均通过，production Dockerfile 已成功构建 `linux/amd64` 本地镜像并确认 runtime 为 `65532:65532`、入口为 `/go-api`。production Drizzle migration 已通过 SSM 隧道成功应用；只读验收确认 `profile_introduction`、lower(login) 索引、主键/唯一键/外键和 4 条 migration journal 均存在，原有 `github_account` 仍为 1 行且新表为 0 行。monorepo `pnpm test`、`pnpm check-types` 以及 Go/Server/Web/Fumadocs production build 均通过（Fumadocs 因沙箱 IPC 限制在正常本机权限下单独验证）。`infra/scripts/push-go-production-image.sh` 会拒绝 dirty worktree，ECR push 与 runtime stack 尚未执行，因此 T-601～T-605 仍保持未完成。

## 阶段 7：API Gateway VPC Link

- [x] T-701：将 SAM 隐式 HttpApi 重构为显式资源，保留 Lambda 路由。
- [ ] T-702：创建 VPC Link 与 ALB private HTTP integration。
- [ ] T-703：配置公开 `/api/v1/*`、health、ready 路由和 path mapping，确认没有公网 `/internal/*` route。
- [x] T-704：更新 CORS，覆盖 production 与受控 Cloudflare preview origins。
- [ ] T-705：验证 tRPC 与 Go route 共存、OPTIONS 与错误路径。

阶段 7 本地实现状态（2026-07-16）：现有隐式 `ServerlessHttpApi` 已按同一 logical ID 显式化，Node 保留 `GET /`、`ANY /trpc/{proxy+}` 及其 OPTIONS；Go private integration、VPC Link、GET/OPTIONS route 和 `overwrite:path=$request.path` 已写入模板。`pnpm check:infra` 固定允许的 7 个 RouteKey，并禁止 `$default`/`/internal` route；Go CORS 只接受 production 精确 origin 或指定 Cloudflare Pages HTTPS 子域后缀。SAM lint、server typecheck 与 Lambda bundle 均通过。T-702～T-705 仍需 foundation/production healthy 后由用户创建 change set并完成真实路由、CORS 与共存验收。

## 阶段 8：Cloud Map 内部调用

- [x] T-801：在 Node 中实现带超时和语义化错误的 Go introduction generate client。
- [x] T-802：实现 `introduction.generate` tRPC mutation，经 Cloud Map 调 Go internal endpoint。
- [ ] T-803：验证 Lambda DNS resolution、task IP 替换、生成超时和 Go 不可用降级。

阶段 8 本地实现状态（2026-07-16）：Node client 固定调用 `/internal/v1/introductions`，默认 base URL 为 Cloud Map 私有 DNS，不携带 Authorization/PAT，并使用 8 秒请求超时；tRPC mutation 对 400/404/503、异常响应和未知内部错误做语义化且不泄密的映射。client 与可注入 router 共 10 项测试全部通过。T-803 仍必须在 ECS/Cloud Map 部署后由用户完成真实 DNS、Task replacement 和故障降级验收。

## 阶段 9：CodeBuild production pipeline

- [x] T-901：编写 production buildspec 与路径 webhook filter。
- [ ] T-902：执行 gofmt、vet、test、Docker build、ECR push。
- [ ] T-903：注册 task revision、更新 ECS service、等待稳定并 smoke test。
- [ ] T-904：验证失败构建不会替换 production stable revision。

阶段 9 本地实现状态（2026-07-16）：`infra/codebuild.yaml`、`infra/buildspec/go-production.yml` 与部署/回滚脚本已完成。production webhook 只接受可信 `master` push 与指定路径；构建成功门、ECR image marker、ECS stable wait、health/readiness smoke test 及上一 image tag 恢复逻辑已加入静态校验。T-902～T-904 仍需阶段 5～8 的真实 AWS 资源就绪后，由用户执行 CodeBuild 并依据真实日志、ECR digest、ECS deployment 与 API 响应验收。

## 阶段 10：PR 独立环境

- [x] T-1001：实现共享 preview key 规范化逻辑。
- [x] T-1002：编写参数化 PR CloudFormation stack。
- [x] T-1003：创建 `pr_<number>` schema migration/seed job。
- [x] T-1004：创建 PR ECS Service、Target Group 与 Header Listener Rule。
- [x] T-1005：在 Cloudflare Preview build 注入 preview key，前端发送 header。
- [ ] T-1006：验证两个并发 PR 的流量和 schema 隔离。

阶段 10 本地实现状态（2026-07-16）：Cloudflare/Vite 与 CodeBuild 使用完整 head commit SHA 生成同一 `preview-<12位sha>`；PR stack 使用 PR number 作为 1～49999 的唯一 listener priority，Fargate Spot 单副本连接独立 preview database 内的 `pr_<number>`。Preview CodeBuild buildspec 内联并启用 PR 审批，权限只能管理 `pr-*` stack，Preview Execution Role 只能读取 preview Secret。PR close/merge 的路由、Service、schema、stack 清理已实现。T-1006 必须部署后由用户创建两个真实 PR 并验证，因此保持未完成。

## 阶段 11：清理、监控和文档

- [x] T-1101：PR merged/closed 自动删除 rule/service/target group/schema。
- [ ] T-1102：添加 TTL tags、定时兜底清理与 ECR lifecycle。
- [x] T-1103：添加 ALB/ECS/API Gateway 告警和运行手册。
- [x] T-1104：更新 README、部署文档、架构图和故障排查说明。
- [ ] T-1105：执行目标级完成审计，逐项验证 requirements 与 acceptance criteria。

阶段 11 本地实现状态（2026-07-16）：PR close/merge buildspec 已按 rule/service → schema → stack 的顺序实现清理；ECR 14 天 lifecycle 与 `ExpiresAt` tag 已存在。production stack 新增 ALB unhealthy/target 5xx、ECS running-task/high-CPU 告警，server stack 新增 HTTP API 5xx 告警，均可选接入现有 SNS Topic 且不新增 IAM Role。`infra/RUNBOOK.md` 与 `docs/go-profile-platform.svg` 已加入。T-1102 只剩定时兜底触发器；EventBridge 启动 CodeBuild 需要额外 invocation role，需由用户先决定是否接受第五个窄权限角色。T-1105 必须结合真实 AWS 部署验收，因此保持未完成。

安全审计补充（2026-07-16）：仅给 Cloudflare 页面配置 Access 无法阻止调用者绕过 Cloudflare 直连 API Gateway。现已新增 `managementProcedure`，覆盖 account list/CRUD、GitHub PAT 拉取与 introduction generate；production Lambda 固定 `MANAGEMENT_API_ENABLED=false`，本地 `.env` 才显式开启。静态边界检查和关闭状态测试已接入，满足 T-006 的 production 只读分支。

## 依赖关系

- 阶段 2 依赖阶段 1。
- 阶段 3 依赖阶段 2 的稳定 API contract。
- 阶段 4 依赖阶段 2。
- 阶段 6 依赖阶段 4、5。
- 阶段 7 依赖阶段 6 Target Group healthy。
- 阶段 8 依赖阶段 6 Cloud Map registration。
- 阶段 9 依赖阶段 5、6 的 production resources。
- 阶段 10 依赖阶段 7、9。
- 阶段 11 依赖阶段 10。

## 部署审批门槛

- 本地文件创建、测试和 CloudFormation validate 可直接执行。
- 安装本机工具需要用户批准系统级写入。
- 阶段 5 起，ECR/ECS/ALB/VPC Link/CodeBuild 等收费或外部状态变更全部由用户亲自执行；Codex 不代为运行 AWS mutation。
- 用户执行前必须先查看 change set，并理解新增、修改、删除资源及回滚方式。
- 数据库 schema 删除属于破坏性操作；只允许删除满足严格 `pr_<digits>` 规则且带匹配 PR tag 的 preview schema。
