# Go 个人主页与容器平台 — 需求规格

## 概述

在保留现有 Cloudflare Pages、API Gateway、Node Lambda/Hono/tRPC 与 RDS PostgreSQL 的基础上，新增 Go REST API。Go 不重新接收 GitHub PAT，而是复用现有流程已经取得并保存的 GitHub username 与账号资料，生成一段新的个人介绍内容并提供公开读取。Go 服务部署到 ECR + ECS/Fargate；公网请求通过 API Gateway HTTP API、VPC Link 与 Internal ALB 进入 Go 服务；Node Lambda 通过 Cloud Map 私有 DNS 调用 Go 的介绍生成能力。Pull Request 使用 Cloudflare Pages Preview 与 CodeBuild 创建可自动销毁的独立 Go 后端环境。

## 项目信息

- 项目名：github-account-info
- AWS Region：`us-east-2`
- 架构类型：pnpm + Turborepo monorepo、React/Vite、Node Lambda、Go REST API、PostgreSQL
- 现有生产资源：Cloudflare Pages、API Gateway HTTP API、Lambda、VPC、NAT Gateway、RDS PostgreSQL

## 需求版本

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-07-15 | v1 | 初始需求与方案 C 决策 |

## 用户故事

- 作为资料维护者，我可以选择一个已经通过 GitHub PAT 获取并保存的账号，让系统根据该账号的 GitHub username 与资料生成新的个人介绍内容。
- 作为访客，我可以通过公开 URL 查看某个 GitHub 用户已经生成的个人介绍页面，无需登录或持有 GitHub PAT。
- 作为项目维护者，我可以继续使用现有 Node 管理能力拉取和保存 GitHub 资料，而不必一次性重写全部后端。
- 作为开发者，我可以在本地运行和测试 Go API，并通过同一个 monorepo 构建链验证变更。
- 作为评审者，我可以访问与 Pull Request 对应的 Cloudflare 前端和 Go 后端预览环境，而不会读写生产 schema。
- 作为运维者，我可以在 PR 合并或关闭后自动清理临时 ECS、ALB 和数据库资源。

## 功能需求

### Go REST API 与介绍生成

1. [F-001] 提供 `GET /healthz` 存活检查，不依赖数据库。
2. [F-002] 提供 `GET /readyz` 就绪检查，验证数据库在短超时内可访问。
3. [F-003] 提供内部 `POST /internal/v1/introductions`，入参只包含已经存在的 `githubUsername` 与明确的重新生成选项，不包含 PAT。
4. [F-004] Go 根据 username 查询 `github_account.login`，读取现有 name、bio、company、location、统计等资料，并把它们作为介绍生成上下文。
5. [F-005] 生成结果写入独立的 `profile_introduction` 表，不修改 GitHub 原始资料；同一账号只保留一个当前发布结果并支持显式重新生成。
6. [F-006] 提供公开 `GET /api/v1/github-users/{username}/introduction`，返回已经生成的介绍及展示所需的公开账号字段；公开 GET 不现场调用生成器。
7. [F-007] API 返回 camelCase JSON；公开响应默认不返回 `email`、数据库自增 `id`、生成供应商凭证或 PAT。
8. [F-008] username 必须经过 GitHub username 格式与长度校验，账号与介绍查询均使用参数化 SQL。
9. [F-009] 未找到账号或尚未生成介绍返回 404；非法输入返回 400；生成依赖或数据库不可用返回 503；未知错误返回不泄露内部细节的 500。
10. [F-010] 第一版使用 Go 内部规则模板生成介绍，不调用 AI 或其它生成服务；生成器通过 Go interface 隔离实现，HTTP、数据库和部署层不依赖模板细节。
11. [F-011] Go 进程支持配置校验、连接池复用、生成超时、请求超时、结构化日志和优雅关闭。

### 公开个人主页

12. [F-012] React 新增 `/u/$username` 公开路由，页面不读取或要求 GitHub PAT。
13. [F-013] 页面以生成的个人介绍为主要内容，并辅助展示头像、姓名、GitHub username、公司、位置和 GitHub 统计。
14. [F-014] 现有管理体验增加“生成/重新生成个人介绍”操作，经 Node tRPC 调用 Lambda，再由 Lambda 通过 Cloud Map 调 Go 内部生成接口。
15. [F-015] 页面明确处理生成中、尚未生成、loading、404、服务不可用和重试状态。
16. [F-016] 公开页面只调用 Go 公开读取接口，不调用 account create/update/delete/upsert 或内部生成接口。

### 生产容器平台

17. [F-017] Go API 构建为非 root、多阶段容器镜像并推送到私有 ECR。
18. [F-018] Go API 运行于私有子网中的 ECS/Fargate Service，初始生产副本数为 1。
19. [F-019] Internal ALB 负责 Go Target Group 健康检查与公开读取转发，不提供公网地址。
20. [F-020] API Gateway HTTP API 通过 VPC Link 将 `/api/v1/*` 与 Go 健康检查路由转发到 Internal ALB，但不创建 `/internal/*` 公网路由。
21. [F-021] 现有 `/trpc/*` 路由继续进入 Node Lambda，不因 Go 部署中断。
22. [F-022] ECS Service 注册到 Cloud Map private DNS namespace，Node Lambda 可在 VPC 内按稳定 DNS 名调用 Go 的内部生成接口。
23. [F-023] 生产数据库凭证与可选生成供应商凭证通过 AWS Secrets Manager/任务 secret 注入，不写入镜像、Task Definition 明文或仓库。

### CI/CD 与 PR 独立环境

24. [F-024] CodeBuild 在 Go 变更时执行格式检查、静态检查、测试、镜像构建和 ECR 推送。
25. [F-025] production 镜像和 PR 镜像均使用不可歧义的 commit SHA 标签。
26. [F-026] 每个 PR 创建独立 ECS Service、Task Definition、Target Group、ALB Listener Rule 与 PostgreSQL schema。
27. [F-027] PR 环境复用生产 VPC、ECS Cluster、ECR、Internal ALB、API Gateway 和 RDS 实例。
28. [F-028] Cloudflare Pages Preview 在构建时注入规范化 preview key，并在 Go 读取请求中发送 `X-Preview-Environment`。
29. [F-029] ALB 按 preview header 将流量转发到对应 PR Target Group；无 preview header 时只能进入生产 Target Group。
30. [F-030] PR Go 连接只使用其 `pr_<number>` schema，不能通过请求参数选择 schema。
31. [F-031] PR merged/closed 时自动删除临时 Service、Target Group、Listener Rule 和 schema。
32. [F-032] 对遗漏清理的 PR 资源提供 TTL 标签和定时兜底清理。

### 安全边界

33. [F-033] 公开访客不需要应用登录即可读取 `/u/$username` 和 introduction GET API。
34. [F-034] 内部生成是写操作，只允许由处于 VPC 内的 Lambda 经 Cloud Map 调用，不得通过 API Gateway 创建公开 `/internal/*` route。
35. [F-035] 为保持现有无登录产品行为，production 显式开启 Node 管理型 tRPC；`managementProcedure` 与默认关闭配置保留为部署开关，同时文档必须明确 CORS 不是认证、该公开写入口只适用于当前个人学习项目风险模型。
36. [F-036] GitHub PAT 不进入 Go 服务、不进入 URL、不写日志、不写数据库。
37. [F-037] Go Task Security Group 只允许 Internal ALB Security Group 与 Lambda Security Group 访问容器端口。
38. [F-038] PR preview 数据不得包含生产敏感数据；默认使用空 schema 或显式非敏感 seed。

## 非功能需求

- 可用性：Go 进程收到终止信号后停止接收新请求、在限定时间内完成在途请求并关闭数据库连接池。
- 性能：账号与 introduction 单行查询使用索引；公开 GET 不触发生成；生成结果持久化并按 source hash 判断是否陈旧；就绪检查使用独立短超时。
- 可观测性：日志包含 request ID、method、path、status、duration，不包含连接串、PAT、secret 或完整错误堆栈响应。
- 兼容性：现有 Node Lambda/tRPC 客户端继续工作；数据库字段类型保持 PostgreSQL/Drizzle 兼容。
- 可维护性：Drizzle migration 是 schema 的唯一事实来源；Go 不维护第二套生产 migration。
- 成本：共享固定基础设施；PR Fargate 默认单副本并在关闭后立即清理。

## 验收标准

- [x] [AC-001] 本地 Go API 的 health、ready、generate、公开 introduction GET、400、404、503 路径均有自动化测试。
- [x] [AC-002] 给定现有 GitHub username，Go 能通过内部映射查询 `github_account.login`、生成 introduction、持久化并在公开 GET 中返回。
- [x] [AC-003] `/u/$username` 在无 token、空 localStorage 的浏览器中可正常展示已生成的个人介绍。
- [x] [AC-004] Go 容器以非 root 用户运行，健康检查正常，镜像不包含 `.env`、生成供应商 secret 或源码凭证。
- [x] [AC-005] API Gateway 的 `/trpc/*` 仍进入 Lambda，`/api/v1/*` 经 VPC Link 进入 Internal ALB，`/internal/*` 不存在公网 route。
- [x] [AC-006] Internal ALB 无公网入口，浏览器不能绕过 API Gateway 直接访问。
- [x] [AC-007] Lambda 可通过 Cloud Map DNS 调用 Go generate endpoint，ECS task IP 变化后仍可重新发现。
- [x] [AC-008] CodeBuild 能从 commit 构建并部署 production Go 镜像，失败时不更新稳定服务。
- [x] [AC-009] 两个并行 PR 可以访问各自的前后端预览环境，数据库 schema 与生成结果相互隔离。
- [x] [AC-010] PR 合并或关闭后临时计算、路由和 schema 被删除，生产服务不受影响。
- [x] [AC-011] 仓库文档与实际 RDS 架构一致，不再将生产数据库描述为 Neon。

## 当前决策

- 采用方案 C：API Gateway HTTP API → VPC Link → Internal ALB → ECS/Fargate Go。
- 公开主页读取无需登录。
- Node 保留 GitHub PAT 与账号写入；Go 负责根据已有账号资料生成并保存独立的 introduction，同时提供公开读取。
- 第一版生成器使用 Go 规则模板，不调用 AI；保留可插拔 interface 仅用于将来扩展。
- production Lambda 为兼容现有功能显式设置 `MANAGEMENT_API_ENABLED=true`；代码级默认仍为 `false`，所有管理型接口仍统一经过 `managementProcedure`。当前没有应用登录或后端身份校验，CORS 不是认证，因此任何知道 API 地址的调用者理论上都能尝试调用写接口；若未来面向多用户，必须先在后端验证 Access identity/JWT 或等价凭证。
- production 与 PR 使用同一 RDS 实例但不同 database/credential；preview database 内按 `pr_<number>` schema 隔离。
- 使用 CloudFormation/SAM 延续现有 IaC，不引入 Terraform/CDK。

## 开放问题

- [O-001 已解决] 当前按用户决策保留无登录的 production 在线管理，以兼容原有功能并接受个人学习项目的公开写入风险；未来面向多用户时再引入后端可验证的身份边界。
- [O-002] 是否为公开主页增加结构化内容字段（headline、skills、featured projects、theme）；第一版至少包含一段 introduction content。
