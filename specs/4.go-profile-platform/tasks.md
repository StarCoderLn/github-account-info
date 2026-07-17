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
- [x] T-307：完成前端类型检查、构建与浏览器联调。

T-307 验收记录（2026-07-17）：类型检查及 `server`、`web`、`go-api` production build 已通过；本地 PostgreSQL + Go 容器的 generate/read API E2E 已通过。Cloudflare Production 已从旧提交 `408357f` 更新到包含公开主页路由的 `f73475d`，部署 `9f5cf939...` 成功。真实 Chrome 无痕窗口在 localStorage 为空、无 token/登录状态下打开 `/u/StarCoderLn`，成功展示由 production Go API 返回的头像、账号资料、模板生成个人介绍和统计信息；因此浏览器联调与公开无认证读取边界均已验收。

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
- [x] T-1006：验证两个并发 PR 的流量和 schema 隔离。

阶段 10 实现状态（2026-07-17）：Cloudflare/Vite 与 CodeBuild 使用完整 head commit SHA 生成同一 `preview-<12位sha>`；PR stack 使用 PR number 作为 1～49999 的唯一 listener priority，Fargate Spot 单副本连接独立 preview database 内的 `pr_<number>`。Preview CodeBuild buildspec 内联并启用 PR 审批，权限只能管理 `pr-*` stack，Preview Execution Role 只能读取 preview Secret。PR close/merge 的路由、Service、schema、stack 清理已实现。真实 PR #1/#2 已创建并触发独立 preview build；首次运行在 PRE_BUILD 安全失败，原因是直接检出 PR head 时 `git rev-parse HEAD^2` 把失败的 revision 字面量与后备 SHA 一并写入，完整 SHA 校验正确阻止后续构建和部署。修复后改用 AWS 在 DOWNLOAD_SOURCE 后提供的 `CODEBUILD_RESOLVED_SOURCE_VERSION`，并补充静态回归检查。Change Set `stage10-preview-resolved-source-review` 已审核并执行，CodeBuild stack 为 `UPDATE_COMPLETE`；`PreviewBuildProject` 物理 ID 保持 `github-account-info-go-preview`，已部署 BuildSpec 包含新变量且不再包含旧 `HEAD^2` 逻辑。第二次运行已精确匹配两个 PR head SHA，但暴露 `BASH_REMATCH` 不能跨独立 BuildSpec command 可靠传递，导致 `PRNumber` 为空；CloudFormation 参数安全门阻止 Stack 创建，仅留下两个格式错误的 `pr--<sha>` ECR 标签。现已改为从已验证的 `CODEBUILD_SOURCE_VERSION` 剥离 `pr/` 前缀并再次校验数字范围。Change Set `stage10-preview-pr-number-review` 已审核并执行，CodeBuild stack 再次为 `UPDATE_COMPLETE`，Preview project 物理 ID 未变化；已部署 BuildSpec 确认包含前缀剥离与数字校验且不存在旧 `BASH_REMATCH` 赋值。T-1006 仍需再次重试两个 PR，取得并发流量与 schema 隔离证据。

阶段 10 第三轮验证（2026-07-17）：PR #1/#2 构建分别精确匹配 `8d229fe...` 与 `6863f08...`，并成功生成格式正确的 `pr-1-<sha>` / `pr-2-<sha>` 不可变镜像，证明 head SHA 与 PR number 解析均已修复。两条构建随后在 CloudFormation `CreateChangeSet` 前被 `go-preview.yaml` 的 YAML anchor/alias 拒绝；没有创建 PR stack、ECS service 或 database schema。模板现已展开四份显式 Tags，验证器禁止 `&PreviewTags` / `*PreviewTags`，且 AWS `validate-template` 已通过。仍需把模板修复带入两个 PR head 后运行第四轮并发验收。

阶段 10 第四轮验证（2026-07-17）：PR #1/#2 已使用无 YAML alias 的模板分别创建 `CREATE_COMPLETE` Stack，均停留在安全的 `RoutingEnabled=false`、`DesiredCount=0` 第一阶段，没有 ECS service 对外路由。两个 `preview-db create` Task 成功启动但应用退出 1，容器日志一致显示 seed SQL 把同一个 `$1` 同时用于 text 拼接和 bigint 加法，触发 PostgreSQL `bigint + text` 类型错误。SQL 现对文本和数值上下文分别使用 `$1::text` / `$1::bigint`，并增加单元测试；主 worktree 与两个 PR worktree 的 `previewdb` 测试均通过。另将所有 deploy/retry 统一为 `deploy_stack false 0 → create schema → deploy_stack true 1`，防止半成品 Stack 重试时先暴露路由。Change Set `stage10-preview-safe-retry-review` 已审核并执行，CodeBuild stack 为 `UPDATE_COMPLETE`、Preview project 物理 ID 未变化，且从已部署 BuildSpec 验证上述五个安全门顺序完整有序。仍需把 SQL 修复推入两个 PR 后运行第五轮。

阶段 10 第五轮验证（2026-07-17）：两个 Stack 均先更新到第五轮 image tag，同时保持 `RoutingEnabled=false`、`DesiredCount=0`，证明安全重试顺序实际生效。数据库 Task revision 2 再次应用退出 1；日志显示直接 `$1::text` 会让 pgx 要求把 Go `int` 编码为 PostgreSQL text。最终修复不再让同一参数承担两种类型：`$1::bigint` 仅接收 `int64` PR number，`$2::text` 仅接收 Go `string` 介绍内容；参数构造函数和测试同时验证数量、运行时类型与禁止角色混用。三份 worktree 的 previewdb 测试、主 Go 模块 gofmt/vet/全量 tests 与 infra 检查全部通过。仍需推送分离参数修复完成下一轮云端验收。

阶段 10 第六轮验证（2026-07-17）：PR #1/#2 最终提交 `ad3d2df...` / `dffcf06...` 分别触发 CodeBuild `082d1c5a...` / `00ca6bc9...`，两条构建均精确解析对应 40 位 head SHA 并全阶段 `SUCCEEDED`。新增测试直接使用 pgx type map 按 PostgreSQL `int8` OID 编码 `int64`、按 `text` OID 编码 Go `string`，覆盖此前真实失败层。两个 database Task 返回 0 后，Stack 才从安全态切换至 `RoutingEnabled=true`、`DesiredCount=1`；两个 ECS Service 均为 FARGATE_SPOT、running/pending=`1/0`、rollout completed，两个独立 Target 均 healthy。Task Definition 分别固定 `DB_SCHEMA=pr_1` / `pr_2`；ALB priority 1/2 分别要求各自 `X-Preview-Environment` 并转发到不同 Target Group。通过 API Gateway 实测两个 Header 均返回 200，响应字段结构相同但 SHA-256 不同；不带 Header 返回 404，证明两个 Preview 数据和 production 默认链路互不串流。Cloudflare 首轮手工重试在 `initialize` 阶段等待 6 分钟后因平台初始化超时失败，未进入 clone/build/deploy；同一提交再次重试后，PR #1/#2 分别生成独立 Cloudflare Preview deployment 与 branch alias，Dashboard 四阶段全部成功，两个 deployment URL 从公网实测均返回 HTTP 200。因此无需重装 GitHub App，前次失败判定为 Cloudflare 临时构建调度故障，Stage 10 双 PR 前后端独立环境验收完成。

## 阶段 11：清理、监控和文档

- [x] T-1101：PR merged/closed 自动删除 rule/service/target group/schema。
- [x] T-1102：添加 TTL tags、定时兜底清理与 ECR lifecycle。
- [x] T-1103：添加 ALB/ECS/API Gateway 告警和运行手册。
- [x] T-1104：更新 README、部署文档、架构图和故障排查说明。
- [x] T-1105：执行目标级完成审计，逐项验证 requirements 与 acceptance criteria。

阶段 11 TTL 云端状态（2026-07-17）：PR close/merge buildspec 已按 rule/service → schema → stack 的顺序实现清理；ECR 14 天 lifecycle 与 `ExpiresAt` tag 已存在。IAM Change Set `stage11-preview-ttl-iam-review` 已执行，Preview CodeBuild Role 原地更新且保持四角色边界；实际 trust policy 只允许同账户、精确 TTL Rule ARN 的 EventBridge，inline policy 只增加 `tag:GetResources` 以及对 preview/TTL 两个 project 的 `codebuild:StartBuild`、`codebuild:BatchGetBuilds`。CodeBuild Change Set `stage11-preview-ttl-codebuild-review` 也已执行，栈为 `UPDATE_COMPLETE`；新增 NO_SOURCE、非 privileged 的 `github-account-info-go-preview-ttl-cleanup` 与已启用的 `cron(0 3 * * ? *)` EventBridge Rule，Target 精确指向该 project 并复用受限 Preview Role。手动空扫描 build `6e3a32f0...` 全阶段 `SUCCEEDED`，日志明确输出 `No tagged preview stacks were found`；扫描前后标签 API 均无 preview Stack，且 Preview 项目最新构建仍是更早的 PR #2 cleanup，证明空扫描没有误触发任何清理。production stack 新增 ALB unhealthy/target 5xx、ECS running-task/high-CPU 告警，server stack 新增 HTTP API 5xx 告警，均可选接入现有 SNS Topic。`infra/RUNBOOK.md` 与 Fumadocs 下的 `deployment/go-service/assets/go-profile-platform.svg` 已加入；F-032 与 T-1102 云端验收完成，T-1105 保持未完成。

阶段 11 PR close 云端验收（2026-07-17）：关闭临时 PR #1/#2 后，GitHub webhook 分别触发 cleanup build `1dcedd0d...` / `67f874b6...`，两条构建均在 `POST_BUILD` 完成并最终 `SUCCEEDED`。CloudFormation 事件证明两个 Stack 先删除 `PreviewService`、完成安全缩容更新，再执行 database drop 和 Stack 删除；build 的 `exit_code == 0` 安全门通过后分别输出 `pr_1` / `pr_2` 已移除。独立复核显示两个 PR Stack 均不存在，ECS 中无 `-pr-` Service，Internal ALB 中无 priority 1/2 Rule，也无 `pr-` Target Group；production `/healthz` 仍返回 200。因此 T-1101、F-031 与 AC-010 的真实自动清理验收完成。

目标级完成审计（2026-07-17）：逐项复核 requirements F-001～F-038、非功能需求和 AC-001～AC-011，所有条目均已有代码、自动化测试或真实云端/浏览器证据。Cloudflare Production `f73475d` 重新部署成功后，Chrome 无痕窗口在空 localStorage、无 token 状态下直接访问 `/u/StarCoderLn` 并完整展示个人介绍，补齐最后的 AC-003。最终回归再次通过 `pnpm check:infra`、Go `vet`/全量测试、Web production build/TypeScript 检查与 Server TypeScript 检查；`git diff --check` 无格式错误。功能目标与运行时验收已完成，仓库收口只剩提交并推送当前 Stage 10/11 最终改动和验收记录。

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
