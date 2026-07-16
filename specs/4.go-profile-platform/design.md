# Go 个人主页与容器平台 — 技术设计

## 设计版本

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-07-15 | v1 | 方案 C 与分阶段实现设计 |

## 范围与迁移策略

本 feature 采用 strangler pattern：现有 Node Lambda/tRPC 继续承载 GitHub PAT 拉取与账号管理写入。Go API 对外统一使用领域名 `username` / `githubUsername`，repository 内部再映射到 GitHub 原始响应与现有数据库的 `login` 字段。Go 使用已经保存的账号字段作为输入上下文，负责生成、保存和公开读取新的个人介绍。Node Lambda 通过 Cloud Map 调用内部生成接口，访客通过 VPC Link + Internal ALB 读取已生成结果。

不在第一版范围内：

- 全量重写 tRPC。
- 让 Go 接收或保存 GitHub PAT，或再次调用 GitHub API获取用户名。
- 在 Go 中建立第二套生产 migration。
- 为每个 PR 创建独立 VPC、ALB、ECR 或 RDS 实例。
- 第一版引入 Redis、消息队列、Service Connect 或 Kubernetes。

## 目标请求路径

```text
Browser
  -> Cloudflare Pages
  -> API Gateway HTTP API
       /trpc/* ---------------> Node Lambda -> RDS/GitHub
       /api/v1/github-users/* -> VPC Link -> Internal ALB -> ECS Go -> RDS

Node Lambda
  -> go-api.github-account-info.local:8080
  -> Cloud Map DNS -> POST /internal/v1/introductions -> ECS Go
```

## 仓库结构

```text
apps/go-api/
├── cmd/api/main.go
├── internal/config/config.go
├── internal/httpapi/router.go
├── internal/httpapi/middleware.go
├── internal/account/repository.go
├── internal/introduction/model.go
├── internal/introduction/repository.go
├── internal/introduction/generator.go
├── internal/introduction/service.go
├── internal/introduction/handler.go
├── internal/postgres/pool.go
├── Dockerfile
├── .dockerignore
├── go.mod
├── go.sum
├── package.json
└── README.md

infra/
├── go-foundation.yaml
├── go-iam.yaml
├── go-production.yaml
├── go-preview.yaml
├── codebuild.yaml
└── buildspec/
    ├── go-production.yml
    └── go-preview.yml
```

Go app 的 `package.json` 只作为 Turborepo task adapter，Go modules 仍是 Go 依赖的事实来源。根脚本只委托给 `turbo run`。

## API contract

### GET /healthz

- 目的：ALB/ECS 存活检查。
- 不访问数据库或外部服务。
- 成功：`200 { "status": "ok" }`。

### GET /readyz

- 目的：部署与人工诊断。
- 使用短超时执行数据库 ping。
- 成功：200。
- 数据库不可访问：503；响应不包含连接串或底层 driver 错误。

### POST /internal/v1/introductions

该接口只由 VPC 内 Lambda 通过 Cloud Map 调用。API Gateway 不配置 `/internal/*` route。

输入：

```json
{
  "githubUsername": "octocat",
  "regenerate": false
}
```

服务流程：

1. 校验 GitHub username。
2. repository 使用 username 查询现有 `github_account.login` 字段；Go 不接收 PAT，也不重新调用 GitHub。
3. 将账号字段映射为 `IntroductionSource`。
4. 计算 source hash；未变化且已有结果、`regenerate=false` 时返回现有结果。
5. 调用 `IntroductionGenerator`。
6. upsert `profile_introduction`，返回生成结果。

具体生成方式通过 interface 注入：

```go
type IntroductionGenerator interface {
    Generate(ctx context.Context, source IntroductionSource) (GeneratedIntroduction, error)
}
```

第一版实现 `TemplateIntroductionGenerator`，完全在 Go 进程内根据非空账号字段组合自然语言段落，不调用 AI 或其它外部生成服务。interface 保留，使未来扩展不会改变 handler/repository contract。

模板生成规则：

- 始终包含 display name（优先 `name`，回退 `githubUsername`）和 `@githubUsername`。
- `bio` 非空时优先作为个性化描述，不重复输出空值。
- 按存在性组合 company、location、公开仓库数、followers 等事实。
- 不推断账号资料中不存在的职业、技能、经历或成就。
- 输出应是稳定、可测试的中文介绍；同一规范化输入生成相同内容。
- 所有用户来源文本作为纯数据处理，前端以文本渲染，禁止当作 HTML 注入。

### GET /api/v1/github-users/{username}/introduction

username 规则：

- 去除首尾空白后长度 1..39。
- 只允许 ASCII 字母、数字和单个连字符规则。
- handler 不拼接 SQL 或 schema。

公开 GET 只读取已经生成并保存的结果，不在访客请求中调用生成器。成功响应：

```json
{
  "githubUsername": "octocat",
  "githubId": 1,
  "name": "The Octocat",
  "avatarUrl": "https://avatars.githubusercontent.com/...",
  "bio": "...",
  "company": "GitHub",
  "location": "San Francisco",
  "blog": "https://github.blog",
  "twitterUsername": null,
  "publicRepos": 8,
  "followers": 100,
  "following": 5,
  "introduction": "The Octocat 是一位……",
  "generatorVersion": "template-v1",
  "generatedAt": "2026-07-15T10:00:00Z",
  "updatedAt": "2026-07-15T10:00:00Z"
}
```

公开模型刻意排除：数据库 `id`、`email`、`createdAt`、PAT。

## Go 应用分层

```text
internal generate handler -> introduction service -> account repository
                                           |-----> introduction generator
                                           `-----> introduction repository -> PostgreSQL

public read handler -> introduction service -> introduction repository -> PostgreSQL
```

- handler：参数解析、状态码和 JSON 编解码。
- service：生成/缓存/重新生成语义和错误分类，不依赖 HTTP。
- account repository：接收领域参数 username，映射为对现有 `login` 列的参数化查询。
- introduction repository：读取与 upsert 生成结果。
- generator：第一版封装规则模板并隔离模板版本；未来扩展不影响服务层。
- postgres：连接池创建、TLS/config 和关闭。
- config：启动时一次性读取和校验环境变量。

禁止使用全局可变 request state。连接池、logger 和只读配置在启动时构造并通过依赖注入传递。

## 数据库设计

### 生产

Go 读取现有 `github_account`，并读写新的 `profile_introduction`。表结构仍由 `packages/db` 的 Drizzle schema/migration 创建，Go 不维护第二套 migration。

现有 `login` 是 GitHub REST API 的字段名，因此数据库暂不重命名。建议在后续 Drizzle migration 中为大小写不敏感 username 查询补充唯一索引或规范化约束；第一步先使用与当前写入一致的精确 `login` 查询。

账号上下文查询字段显式列出，禁止 `SELECT *`。介绍表建议结构：

```text
profile_introduction
  id
  github_account_id UNIQUE REFERENCES github_account(id) ON DELETE CASCADE
  content TEXT NOT NULL
  generation_method TEXT NOT NULL
  generator_version TEXT NOT NULL
  source_hash TEXT NOT NULL
  generated_at TIMESTAMP NOT NULL
  created_at TIMESTAMP NOT NULL
  updated_at TIMESTAMP NOT NULL
```

`generator_version` 第一版记录 `template-v1`，用于模板升级后判断是否需要重新生成。

账号查询：

```sql
SELECT
  login,
  github_id,
  name,
  avatar_url,
  bio,
  company,
  location,
  blog,
  twitter_username,
  public_repos,
  followers,
  following,
  updated_at
FROM github_account
WHERE login = $1
LIMIT 1;
```

### PR schema

- schema 名只能由 CodeBuild 解析出的 PR number 构造：`pr_<digits>`。
- schema 不是 HTTP input。
- Task Definition 注入受信任的 `DB_SCHEMA=pr_123`。
- 连接初始化设置受控 search path；SQL 内不动态拼 schema。
- schema 初始化复用 Drizzle migration SQL 或专用 migration job，不在 Go runtime 启动时自动迁移。
- 默认空数据或非敏感 seed，禁止从 production 全量复制。

## React 设计

新增公开 route `/u/$username`，与现有 token 编辑 route `/profile` 分离：

- `/u/$username`：公开读取已生成 introduction，无 token。
- `/profile`：现有管理/编辑体验，增加生成/重新生成操作，部署前进入管理边界。

公开页面使用独立 introduction API client，不依赖 `AppRouter` 推导，因为 Go REST API 不属于 tRPC router。管理端 generate mutation 仍通过 `AppRouter` 推导，并由 Lambda 的 Go client 调内部接口。TypeScript response schema 应由 zod 在网络边界校验，避免信任未经验证的 JSON。

## 容器设计

- 多阶段构建。
- builder 固定到 Go toolchain 版本与官方多架构 manifest digest，并校验 `go.sum`。
- runtime 使用不可变的 `scratch` 空基础层，只包含静态二进制和 RDS CA bundle；`scratch` 没有可漂移的 tag 或 digest。
- `CGO_ENABLED=0`，目标 Linux。
- 非 root UID/GID。
- 监听 `0.0.0.0:8080`。
- 运行镜像不包含 Go compiler、git、`.env` 或源码。
- TLS 连接 RDS 使用 AWS 官方 `us-east-2` root bundle；生产代码强制 TLS 1.2+、证书链与 hostname 校验，并移除明文 fallback，即使连接串误写 `sslmode=disable` 也不会降级。

## AWS 网络与流量设计

### Subnets

- Internal ALB 至少关联两个 AZ 的私有子网。
- ECS tasks 运行在私有子网，不分配 public IP。
- 继续使用现有 NAT 或按后续成本优化增加 ECR/Logs/Secrets VPC endpoints。

### Security groups

| Source | Destination | Port | Purpose |
| --- | --- | --- | --- |
| API Gateway VPC Link SG | Internal ALB SG | listener port | 公共 Go API 私有集成 |
| Internal ALB SG | Go Task SG | 8080 | ALB 转发与 health check |
| Lambda SG | Go Task SG | 8080 | Cloud Map 内部调用 |
| Go Task SG | RDS SG | 5432 | PostgreSQL |

Go Task SG 不接受 VPC CIDR 全放行；RDS SG 使用 security-group reference，不使用公网 CIDR。

### API Gateway

将现有 SAM 隐式 HttpApi 改为显式资源，避免新增私有 integration 时出现路由所有权不清：

- `/trpc/{proxy+}` 与必要 root route -> Lambda integration。
- `/api/v1/{proxy+}` -> VPC Link + ALB listener integration。
- `/healthz` 与 `/readyz` -> VPC Link + ALB。
- 不创建 `/internal/{proxy+}` 公网 route；该路径只通过 Cloud Map task DNS 访问。

部署时验证 private integration path，避免 stage name 被意外加入后端 path。

## Cloud Map 设计

- namespace：`github-account-info.local`，private DNS。
- service：`go-api`。
- Lambda 内部 URL：`http://go-api.github-account-info.local:8080/internal/v1/introductions`。
- 复用 VPC 必须同时设置 `enableDnsSupport=true` 与 `enableDnsHostnames=true`；Cloud Map private DNS 背后是 Route 53 Private Hosted Zone，缺少任一属性都会使 Lambda DNS 解析失败。
- ECS 控制面负责注册/注销 production task 私网 IP；preview 不注册到该 service，避免 Lambda 随机发现 PR Task。
- Node Go client 使用连接与总请求超时；不会无限重试非幂等操作。

Cloud Map 的首个真实业务调用就是 introduction generate：管理端 tRPC mutation 进入 Lambda，Lambda 根据 username 调用 Go，Go repository 再查询现有数据库 `login` 字段并保存生成结果。

## IAM 设计

### Production CodeBuild Role

- ECR authorization/push。
- CloudFormation 只允许 production stack。
- ECS describe/update/wait。
- ELBv2 与 Cloud Map 的必要部署权限。
- `iam:PassRole` 只允许 Production Execution Role。
- CloudWatch Logs。
- 只读所需 Secrets/parameters。

### Preview CodeBuild Role

- webhook buildspec 内联并启用 PR 评论审批。
- ECR push，但 CloudFormation/ECS/ELB 只能管理 `pr-*` 资源。
- `iam:PassRole` 只允许 Preview Execution Role，不能传 production role。

### Production ECS Task Execution Role

- ECR pull。
- CloudWatch Logs。
- Task Definition 引用 Secrets Manager 值时读取指定 secret ARN。

### Preview ECS Task Execution Role

- ECR pull 与 CloudWatch Logs。
- 只能读取独立 preview database Secret，不能读取 production Secret。

Go 第一版不调用 AWS API，因此 Task Definition 不设置 `TaskRoleArn`。将来若使用 RDS IAM Auth、S3、SQS、Bedrock 或应用主动读取 Secret，再新增精确的 Task Role。

## CI/CD 设计

### Production

```text
push master with apps/go-api/** or infra/**
  -> gofmt check
  -> go vet
  -> go test
  -> docker build
  -> ECR push :prod-<sha>
  -> deploy task definition/service
  -> wait services-stable
  -> API Gateway smoke test
```

### Pull Request

CodeBuild 环境来源：

- `CODEBUILD_WEBHOOK_TRIGGER=pr/<number>`。
- `CODEBUILD_WEBHOOK_HEAD_REF=refs/heads/<branch>`。
- `CODEBUILD_RESOLVED_SOURCE_VERSION=<commit sha>`。

Cloudflare Pages 来源：

- `CF_PAGES_BRANCH`。
- `CF_PAGES_COMMIT_SHA`。

仓库通过 `@github-account-info/preview-environment` 将完整 head commit SHA 规范化为 `preview-<前12位sha>`。Cloudflare Vite build 与 CodeBuild 使用同一逻辑。ALB listener rule 使用 `X-Preview-Environment=<preview-key>` 条件；production build 不发送该 header。

每 PR CloudFormation stack 建议命名 `github-account-info-go-pr-<number>`，包含：

- ECS Service/Task Definition。
- Target Group。
- Listener Rule。
- schema migration job 的部署参数与 tags。

PR close/merge cleanup 顺序：先移除 listener rule，再缩容/删除 ECS service，然后删除 target group，最后删除 preview schema 与过期镜像引用。

production 与 preview 复用同一 RDS 实例，但使用不同 database 和不同 Secrets Manager Secret。preview database 内每个 PR 使用 `pr_<number>` schema；只 seed 虚构 `preview-user`，不复制 production 账号或介绍。

这里的 per-PR schema 是面向已审批协作者的功能隔离，不是对恶意租户的强安全隔离：同一个 preview database credential 理论上可以访问其它 preview schema。因此外部贡献者的 PR 必须先经过 CodeBuild `ALL_PULL_REQUESTS` 审批才允许执行；production database 使用独立 credential，Preview Role 和 Preview Task 均不能读取 production Secret。

## 可观测性

- Go JSON logs：requestId、method、path template、status、durationMs、environment、task metadata。
- 不记录 query/body 中的敏感值。
- ALB target 5xx、unhealthy host、ECS stopped task、API Gateway 5xx 建立告警。
- `/readyz` 不作为高频 ALB health check，ALB 使用 `/healthz`。

## 回滚策略

- API Gateway `/trpc/*` 与现有 Lambda 保持独立，不受 Go 回滚影响。
- ECS task definition 使用不可变 SHA image tag；回滚到上一 revision。
- production ALB default target group 不由 PR stack 修改。
- PR Listener Rule 和 schema 都按 PR stack/tag 识别，cleanup 不操作 production resources。

## AWS 实施协作约定

阶段 5 之前由 Codex 完成本地代码、测试、容器与 IaC 草案。阶段 5 起，Codex 不直接创建、更新或删除 AWS 资源：

1. Codex 解释本批资源、网络路径、IAM 权限、成本和回滚方式。
2. Codex 提供可审查的 CloudFormation change set/CLI/Console 步骤。
3. 用户亲自执行并在 AWS Console 观察资源。
4. 用户回传脱敏后的 stack event、resource status、ARN/ID 或测试结果。
5. Codex 核验结果并更新任务状态，再进入下一批资源。

CloudFormation 是基础设施事实来源；Console 用于学习、观察和故障定位，不直接制造未纳入模板的生产漂移。任何 Secret/PAT/数据库密码只在 Secrets Manager、CloudFormation parameter 或本地受保护环境中输入，不回传给 Codex。

## 安全决策

- 访客公开读取无需登录。
- Go 的公开 `/api/v1` 无写 endpoint；内部 `POST /internal/v1/introductions` 是受 VPC 网络与管理入口边界保护的写操作。
- 第一版只使用 Go 规则模板生成，不调用 AI 或外部生成 API。
- email 默认不是 public profile 字段。
- production 按兼容性决策显式设置 `MANAGEMENT_API_ENABLED=true`，继续提供原有 Node 账号管理与 PAT 拉取；Lambda 仍直连 RDS 管理 `github_account`，并通过 Cloud Map 调 Go 完成 introduction generate。代码默认保持关闭且所有管理型接口统一经过 `managementProcedure`，便于未来切换安全策略。当前无登录写入口不是认证安全方案；仅保护 Cloudflare 页面也不能防止直连 API Gateway，若面向多用户必须增加后端可验证的 identity/JWT 或等价凭证。
- preview header 只用于路由，不视为认证；PR schema 不含生产秘密数据。
- PR schema 隔离只服务于可信协作者并行验证，不把共享 preview credential 当成多租户安全边界。
- PAT 继续遵循现有请求头传输、不记录、不响应的约束，且永不进入 Go。
