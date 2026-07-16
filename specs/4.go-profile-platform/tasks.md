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
- [x] T-006：明确 production 管理边界：保留现有无登录 Node 管理链路，并记录公开写入口仅适用于个人学习项目的风险。
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

- [x] T-601：构建并推送首个 SHA-tagged ECR image。
- [x] T-602：创建 production Task Definition、Target Group 与 ECS Service。
- [x] T-603：配置 private subnets、security groups、secret injection 与 Cloud Map registration。
- [x] T-604：验证 task healthy、ALB VPC 内访问、RDS 查询与 CloudWatch logs。
- [x] T-605：验证 Internal ALB 无公网可达路径。

阶段 6 云端验收（2026-07-16）：`github-account-info-go-production` 已为 `CREATE_COMPLETE`，使用不可变镜像 `prod-e75ba48214bc01ce27ac9a8f6aec8d28c816b9ea`（digest `sha256:445817570ded060f84db96826257c0c6f225d50deb496dbc47c1e7dda168b45d`）。ECS Service 为 `ACTIVE`，desired/running/pending=`1/1/0`、rollout=`COMPLETED`、failedTasks=`0`；ALB Target `10.0.2.84:8080` 为 healthy，Cloud Map 同一实例为 `HEALTHY`。Task 使用两座 private subnet、`AssignPublicIp=DISABLED`，实际 ENI 仅有 private IP 并绑定 Go Task SG；ALB `Scheme=internal` 且位于同一 VPC 的两座 private subnet。CloudWatch Logs 已记录 Go API 监听 8080 以及持续 `/healthz` 200，应用启动前的 `pool.Ping` 成功也证明 production Secret、RDS 网络与 verify-full TLS 链路可用；4 个 production alarms 均为 `OK`。因此阶段 6 已完成，公网 `/readyz` 将在阶段 7 通过 VPC Link 再做端到端验收。

## 阶段 7：API Gateway VPC Link

- [x] T-701：将 SAM 隐式 HttpApi 重构为显式资源，保留 Lambda 路由。
- [x] T-702：创建 VPC Link 与 ALB private HTTP integration。
- [x] T-703：配置公开 `/api/v1/*`、health、ready 路由和 path mapping，确认没有公网 `/internal/*` route。
- [x] T-704：更新 CORS，覆盖 production 与受控 Cloudflare preview origins。
- [x] T-705：验证 tRPC 与 Go route 共存、OPTIONS 与错误路径。

阶段 7 云端验收（2026-07-16）：`stage7-vpc-link-review-v3` 与两次无替换修复均已执行，API stack 和 Foundation stack 为 `UPDATE_COMPLETE`，API ID 仍为 `mdgq1tigyl`，VPC Link `5fkxcv` 为 `AVAILABLE`。首次 Go GET 被 ALB 以 400 拒绝；指标显示 `HTTPCode_ELB_4XX_Count=3` 而 target 4XX 无数据，最终定位到 Internal ALB `routing.http.desync_mitigation_mode=strictest`。按 AWS 官方排障建议改为 `defensive` 后，`/healthz`、`/readyz` 均返回 JSON 200，公开缺失用户返回 JSON 404，Go ECS 日志记录了对应 GET；受控 Cloudflare Origin 的 Go 与 tRPC OPTIONS 均返回 204 和正确 CORS，公网 `/internal/*` 返回 404。Node 根路径和 `account.list` tRPC 继续返回 200，部署 route 清单恰好只有约定的 7 条且没有 `$default`/`/internal`。因此 T-702、T-703、T-705 与 Stage 7 全部完成，并用静态检查固定 ALB defensive 回归边界。

## 阶段 8：Cloud Map 内部调用

- [x] T-801：在 Node 中实现带超时和语义化错误的 Go introduction generate client。
- [x] T-802：实现 `introduction.generate` tRPC mutation，经 Cloud Map 调 Go internal endpoint。
- [x] T-803：验证 Lambda DNS resolution、task IP 替换、生成超时和 Go 不可用降级。

阶段 8 云端验收（2026-07-16）：Node client 固定调用 `/internal/v1/introductions`，默认 base URL 为 Cloud Map 私有 DNS，不携带 Authorization/PAT，并使用 8 秒请求超时；tRPC mutation 对 400/404/503、异常响应和未知内部错误做语义化且不泄密的映射，相关 contract/边界测试全部通过。首次真实调用因复用 VPC `enableDnsHostnames=false` 返回语义化 503，提供了 Go 不可用降级证据；用户确认启用后，VPC 两项 DNS 属性均为 true，同 VPC bastion 可解析 Cloud Map。不存在用户调用恢复为契约化 tRPC 404；用户确认的首次 production 生成返回 200、`generated=true`、非空介绍与 generatorVersion，第二次返回 `generated=false`，公开 Go GET 返回 200。随后执行 ECS force new deployment：旧 Task `d0af...` / `10.0.2.84` 被新 Task `51aa...` / `10.0.3.90` 替换，rollout completed、failedTasks=0，Cloud Map 与 ALB 均只保留新 IP 且 healthy；Lambda 经稳定 DNS 再次调用返回 200/cache hit，health/ready 仍为 200。用户名、个人资料和介绍内容均未输出。结合自动化 timeout contract test，T-803 与 Stage 8 全部完成。

## 阶段 9：CodeBuild production pipeline

- [x] T-901：编写 production buildspec 与路径 webhook filter。
- [x] T-902：执行 gofmt、vet、test、Docker build、ECR push。
- [x] T-903：注册 task revision、更新 ECS service、等待稳定并 smoke test。
- [x] T-904：验证失败构建不会替换 production stable revision。

阶段 9 云端状态（2026-07-17）：`infra/codebuild.yaml`、`infra/buildspec/go-production.yml` 与部署/回滚脚本已完成，并已通过 AWS `validate-template`（要求 `CAPABILITY_IAM`）。production webhook 只接受可信 `master` push 与指定路径；构建成功门、ECR image marker、ECS stable wait、health/readiness smoke test 及上一 image tag 恢复逻辑已加入静态校验。GitHub CodeConnection `github-account-info-go` 已由用户在 AWS Console 完成授权，并由 CLI 复核为 `AVAILABLE`。首次 CREATE Change Set `stage9-codebuild-review` 在 `ProductionBuildProject` 的 `CreateWebhook` 阶段因 GitHub App 尚未安装而回滚；没有 CodeBuild project 或 IAM policy 残留。用户随后已安装 AWS Connector for GitHub，并只授权 `github-account-info` repository；失败空 stack 与两个 0-byte retained log group 已清理。修复 Change Set `stage9-codebuild-review-v2` 已执行，`github-account-info-go-codebuild` 为 `CREATE_COMPLETE`。production/preview 两个 project 与 webhook 均为 `ACTIVE`；production 实际 filter 只有 `PUSH + master + FILE_PATH`，preview 只有目标 master 的 PR create/update/reopen/merge/close 且要求 `ALL_PULL_REQUESTS` 评论审批。首次真实 production build `e2071d29-29fe-4d40-958e-f56b722f1790` 正确拉取完整 commit `2d533563...`，但 buildspec 误从 `FROM` 而不是 Dockerfile 的 digest-pinned `ARG GO_IMAGE` 解析 builder，因而在 PRE_BUILD 安全门失败。失败后 ECR 不存在对应 `prod-2d533563...` tag，production stack 仍使用 `prod-e75ba482...`，ECS 仍为 task definition revision 1、running/pending=`1/0`、rollout completed，证明部署门阻止了稳定版本替换并完成 T-904。解析器修复提交 `6ccb133` 触发的第二次 build `4d8fbdce-0c53-4172-b0ab-3a73bbac6d95` 已通过 PRE_BUILD、gofmt、vet、test、Docker build 与 ECR push，对应不可变镜像 `prod-6ccb1339597811088b4f2ea6482cff358688b1ff` 已生成，因此 T-902 完成；POST_BUILD 在创建 Change Set 前被缺少只读 `cloudformation:GetTemplateSummary` 权限拦截，production stack 与 ECS stable revision 均未变化。IAM Change Set `stage9-codebuild-get-template-summary-review` 已审核并执行，IAM stack 为 `UPDATE_COMPLETE`；production/preview 两个 CodeBuild Role 均原地更新且已从实际 inline policy 复核只新增 `cloudformation:GetTemplateSummary`，无新增、删除或替换资源。第三次 build `a059d748-1293-42a8-b47b-7921a58fbea4` 固定构建 commit `c3369b9e...`，INSTALL、PRE_BUILD、BUILD、POST_BUILD、UPLOAD_ARTIFACTS 与 FINALIZING 全部成功；ECR 镜像 digest 为 `sha256:9656a5fc35bd2095007e7683c4b29664ea137b2442b0729a629692971b475281`。production stack 为 `UPDATE_COMPLETE`，ECS 已切换到 task definition revision 2，desired/running/pending=`1/1/0`、failedTasks=0、rollout completed，ALB target healthy；API Gateway health、ready、Node root 与 `account.list` tRPC 均返回 200，完成 T-903 且证明原 Node 链路无回归。

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

安全审计补充（2026-07-16）：仅给 Cloudflare 页面配置 Access 无法阻止调用者绕过 Cloudflare 直连 API Gateway。`managementProcedure` 覆盖 account list/CRUD、GitHub PAT 拉取与 introduction generate，代码默认仍为关闭；根据用户确认的渐进迁移方案，production 模板显式设置 `MANAGEMENT_API_ENABLED=true`，保留原 Node → RDS 账号链路，仅新增 Lambda → Cloud Map → Go 的介绍生成链路。这一兼容性选择不等于认证，公开写入口只适用于当前个人学习项目风险模型。

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
