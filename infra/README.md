# Go 平台基础设施

本目录是 Go API AWS 基础设施的事实来源。阶段 5 开始采用“Codex 指导、用户操作、共同验收”：模板可以在本地编写和验证，但任何 change set 创建、执行、部署或删除都由用户亲自操作。

整体运行与部署链路见 [`go-profile-platform.svg`](../apps/fumadocs/content/docs/deployment/go-service/assets/go-profile-platform.svg)，分步骤教程见 Fumadocs 的 `deployment/go-service` 章节。

## 文件边界

- `go-foundation.yaml`：共享且低频变化的 ECR、ECS Cluster、Cloud Map、Internal ALB、Security Groups 和 CloudWatch Log Group。
- `go-iam.yaml`：production/preview 各自的 ECS Execution Role 与 CodeBuild Role，共四个隔离 IAM Role；依赖 foundation exports。
- `go-production.yaml`：production Task Definition、Target Group、ALB path rule 和 ECS Service；只接受不可变的 `prod-<commit-sha>` image tag。
- `go-preview.yaml`：承载单个 PR 的 runtime/database Task Definition、Fargate Spot Service、Target Group 和 header Listener Rule。
- `codebuild.yaml`：production 与 preview 两个权限隔离的 CodeBuild project；PR buildspec 内联且需要可信成员审批。
- `buildspec/go-production.yml`：格式、依赖、静态检查、测试、镜像构建/推送、production 部署与 smoke-test 回滚。
- `RUNBOOK.md`：CloudWatch 告警、API/ALB/ECS/Cloud Map 分层排障、production 回滚和 PR 清理审计。

共享栈不会启动 Fargate Task，也不会修改 API Gateway。Internal ALB 创建后默认只返回受控 404，直到阶段 6 添加 production Listener Rule。

`go-production.yaml` 已可在本地审查，但在 foundation、IAM stack 完成且首个 SHA image 推送到 ECR 前不能部署。production rule 只转发 `/api/v1/*`、`/healthz` 和 `/readyz`；不会为 `/internal/*` 建立 ALB route。Lambda 的内部生成调用仍通过 Cloud Map DNS 直达 Go Task 的 TCP 8080。

## 参数契约

`go-foundation.yaml` 只引用现有网络资源，不创建第二套 VPC 或数据库：

| 参数 | 内容 | 要求 |
| --- | --- | --- |
| `VpcId` | 当前 Lambda/RDS 所在 VPC | 必须与所有传入资源属于同一 VPC |
| `PrivateSubnetIds` | ALB 与 Fargate 使用的私有子网 | 至少两个不同 AZ；不得开启自动分配公网 IPv4 |
| `LambdaSecurityGroupId` | 当前 Node Lambda SG | 出站必须允许到 Go Task SG 的 TCP 8080；多数现有 SG 默认允许全部出站 |
| `RdsSecurityGroupId` | 当前 RDS SG | 模板只增加来自 Go Task SG 的 TCP 5432 入站规则 |

`go-iam.yaml` 只引用数据库 Secret，不接收 Secret value：

| 参数 | 内容 | 要求 |
| --- | --- | --- |
| `DatabaseUrlSecretArn` | production Secret ARN | SecretString 整体是 `postgresql://...`；这里只传 ARN，绝不传值 |
| `DatabaseSecretKmsKeyArn` | 可选客户管理 KMS key ARN | 使用默认 `aws/secretsmanager` key 时留空 |
| `PreviewDatabaseUrlSecretArn` | preview-only Secret ARN | 指向同一 RDS 实例内独立 preview database；用户无 production 表权限 |
| `PreviewDatabaseSecretKmsKeyArn` | 可选客户管理 KMS key ARN | 使用默认 `aws/secretsmanager` key 时留空 |

数据库 Secret 推荐在 AWS Console 的 Secrets Manager 页面创建，名称使用 `github-account-info/production/database-url`，Secret value 填当前完整 `DATABASE_URL`。不要把 value 写进参数 JSON、shell history、CloudFormation template、聊天记录或 Git。

preview Secret 使用名称 `github-account-info/preview/database-url`。它不能复用 production URL，应连接同一 RDS 实例里的独立 `github_account_info_preview` database。这样不增加第二个 RDS 实例费用，同时 production 表不会出现在 preview database 中；每个 PR 再在其中使用独立 `pr_<number>` schema。

`infra/parameters/` 默认忽略本地参数文件，只保留无真实资源 ID 的 example。复制后可创建未提交文件：

```bash
cp infra/parameters/go-foundation.example.json infra/parameters/go-foundation.local.json
cp infra/parameters/go-iam.example.json infra/parameters/go-iam.local.json
```

## 阶段 5 操作顺序

以下命令均使用 `us-east-2`。在每一步把输出与 AWS Console 对照，不要把 Secret value 返回给 Codex。

### 1. 确认身份与现有 Lambda 网络

```bash
aws sts get-caller-identity

aws lambda get-function-configuration \
  --region us-east-2 \
  --function-name github-account-info-api \
  --query 'VpcConfig.{VpcId:VpcId,SubnetIds:SubnetIds,SecurityGroupIds:SecurityGroupIds}' \
  --output json
```

这里只记录 VPC、Subnet 和 SG ID。访问密钥、数据库连接串及其他 Secret 不应出现在输出中。

### 2. 找出两个真正的私有子网

把 `<VPC_ID>` 换成上一步结果：

```bash
aws ec2 describe-subnets \
  --region us-east-2 \
  --filters Name=vpc-id,Values=<VPC_ID> \
  --query 'Subnets[].{SubnetId:SubnetId,AZ:AvailabilityZone,PublicIPv4:MapPublicIpOnLaunch,Cidr:CidrBlock}' \
  --output table
```

选择两个不同 AZ 且 `PublicIPv4=false` 的子网。随后在 VPC Console 的 Route tables 中确认它们具有到现有 NAT Gateway 的默认路由，或者已经具备 ECR API/ECR DKR、CloudWatch Logs 和 Secrets Manager VPC endpoints。没有这条出站路径，Fargate 会在拉镜像或注入 Secret 时失败。

Internal ALB 强制要求至少两个不同 AZ 的子网；如果现有 VPC 只有一个合格私有子网，先停在这里讨论补充子网，不要用公网子网代替。

### 3. 确认 RDS 安全组与私网属性

```bash
aws rds describe-db-instances \
  --region us-east-2 \
  --query 'DBInstances[].{Identifier:DBInstanceIdentifier,VpcId:DBSubnetGroup.VpcId,SecurityGroups:VpcSecurityGroups[].VpcSecurityGroupId,PubliclyAccessible:PubliclyAccessible}' \
  --output table
```

确认目标实例的 VPC 与步骤 1 相同，并记录 RDS SG。`PubliclyAccessible` 是否为 false 不影响模板参数，但生产目标应保持私网访问。

同时确认 ECS service-linked role 已存在（只读）：

```bash
aws iam get-role \
  --role-name AWSServiceRoleForECS \
  --query 'Role.{RoleName:RoleName,Arn:Arn}' \
  --output table
```

若返回 `NoSuchEntity`，ECS 在创建 Cluster/Service 时通常会自动创建该角色，但执行者仍需 `iam:CreateServiceLinkedRole`。为避免 stack 中途失败，可以由用户预先执行一次：

```bash
aws iam create-service-linked-role \
  --aws-service-name ecs.amazonaws.com
```

这是阶段 6 创建使用 `awsvpc`、负载均衡和服务发现的 ECS Service 所需的账户级角色，不属于本项目定义的四个应用 IAM Role。

### 4. 本地静态验证

以下操作不访问或修改 AWS：

```bash
sam validate --template-file infra/go-foundation.yaml --lint
sam validate --template-file infra/go-iam.yaml --lint
```

再使用 AWS 的只读 template validation：

```bash
aws cloudformation validate-template \
  --region us-east-2 \
  --template-body file://infra/go-foundation.yaml

aws cloudformation validate-template \
  --region us-east-2 \
  --template-body file://infra/go-iam.yaml
```

### 5. 只创建 foundation 待审 change set

先填写被 Git 忽略的 `infra/parameters/go-foundation.local.json`。然后由用户执行：

```bash
aws cloudformation create-change-set \
  --region us-east-2 \
  --stack-name github-account-info-go-foundation \
  --change-set-name stage5-foundation-review \
  --change-set-type CREATE \
  --template-body file://infra/go-foundation.yaml \
  --parameters file://infra/parameters/go-foundation.local.json \
  --description 'Stage 5 shared Go platform foundation; review before execution'
```

这一步会在 AWS 中创建 change set，但不会创建模板内资源。创建后查看：

```bash
aws cloudformation describe-change-set \
  --region us-east-2 \
  --stack-name github-account-info-go-foundation \
  --change-set-name stage5-foundation-review \
  --query '{Status:Status,ExecutionStatus:ExecutionStatus,Changes:Changes[].ResourceChange.{Action:Action,LogicalId:LogicalResourceId,Type:ResourceType,Replacement:Replacement}}' \
  --output json
```

把资源变化列表和脱敏后的失败事件返回给 Codex共同审查。不要执行 change set，直到逐项确认成本、安全组方向和回滚方案。foundation change set 不应出现 `AWS::IAM::Role`。

Cloud Map private DNS 会创建 Route 53 Private Hosted Zone，因此复用的 VPC 必须同时启用 DNS support 与 DNS hostnames。foundation 执行前检查：

```bash
aws ec2 describe-vpc-attribute \
  --region us-east-2 \
  --vpc-id <vpc-id> \
  --attribute enableDnsSupport

aws ec2 describe-vpc-attribute \
  --region us-east-2 \
  --vpc-id <vpc-id> \
  --attribute enableDnsHostnames
```

两项都必须返回 `Value: true`。如果该 VPC 不由本仓库 CloudFormation 管理，需要把属性变更作为一次显式、人工审计的 VPC 前置操作；否则 Lambda 即使与 Task 位于同一 VPC且安全组正确，也无法通过 Cloud Map private DNS 解析 Go Task。

### 6. foundation 完成后创建 IAM 待审 change set

IAM stack 通过 `Fn::ImportValue` 引用 foundation 的 ECR、Cluster、Listener 和 Log Group，因此必须在 foundation stack 执行成功后创建。先填写被 Git 忽略的 `infra/parameters/go-iam.local.json`，其中只写 Secret ARN，绝不写 Secret value：

```bash
aws cloudformation create-change-set \
  --region us-east-2 \
  --stack-name github-account-info-go-iam \
  --change-set-name stage5-iam-review \
  --change-set-type CREATE \
  --template-body file://infra/go-iam.yaml \
  --parameters file://infra/parameters/go-iam.local.json \
  --capabilities CAPABILITY_NAMED_IAM \
  --description 'Stage 5 four isolated Go platform IAM roles; review before execution'
```

查看时预期恰好有四个 `AWS::IAM::Role`，且没有网络、ALB、ECS Service 或数据库资源：

```bash
aws cloudformation describe-change-set \
  --region us-east-2 \
  --stack-name github-account-info-go-iam \
  --change-set-name stage5-iam-review \
  --query '{Status:Status,ExecutionStatus:ExecutionStatus,Changes:Changes[].ResourceChange.{Action:Action,LogicalId:LogicalResourceId,Type:ResourceType,Replacement:Replacement}}' \
  --output json \
  --no-cli-pager
```

2026-07-16 云端结果：`github-account-info-go-foundation` 与 `github-account-info-go-iam` 均为 `CREATE_COMPLETE`；IAM stack 的资源清单恰好为四个 `AWS::IAM::Role`，未创建网络、ALB、ECS Service 或数据库资源。阶段 5 至此完成，后续生产 runtime stack 继续通过 foundation/IAM exports 引用这些共享资源。

## 成本与回滚边界

- Internal ALB 创建后持续计费，即使还没有 ECS Task。
- ECR 与 CloudWatch Logs 按存储/使用量计费；ECR lifecycle 会限制旧镜像累积。
- ECS Cluster 本身不启动计算；阶段 6 创建 Fargate Service 后才产生任务计算费用。
- Cloud Map private DNS namespace/service用于 Lambda 到 Go Task 的私有发现；它不替代 ALB 或 VPC Link。
- 在 change set 执行前，可用 `delete-change-set` 无资源回滚。
- 执行后若删除 foundation stack，ECR Repository 与 ECS Log Group按模板策略保留；其他共享资源会删除。IAM/production 等下游 stack 通过 exports 依赖 foundation，因此必须按相反顺序先删除下游 stack。

## 阶段 6：首次 production migration

Go runtime 不会自动建表，production schema 仍以 `packages/db/src/migrations/` 下的 Drizzle migration 为唯一事实来源。首次部署 Go Service 前，必须先通过现有 SSM 隧道应用 migration；这会在现有 RDS instance 的 `github_account_info` 数据库中创建缺失对象，不会创建新的 RDS instance，也不会增加一份数据库实例费用。

1. 在一个终端保持到 RDS 的 SSM port-forwarding session，监听本地 `15432`。
2. 在另一个终端从仓库根目录执行：

```bash
bash infra/scripts/migrate-production-via-tunnel.sh
```

脚本会隐藏读取 production `DATABASE_URL`，校验目标 database 必须是 `github_account_info`，然后仅在 migration 子进程中把地址改写为 `127.0.0.1:15432`，并设置 `sslmode=require&uselibpqcompat=true`。这里必须显式启用 libpq 兼容语义：SSM 隧道的本地地址无法匹配 RDS 证书主机名，但客户端到 RDS 的 TLS 加密仍为强制。连接串不会写入仓库、参数文件或 shell history。不要启用 `bash -x`，也不要把 Secret value 粘贴到聊天或终端命令行。

成功后，以管理员连接 production database 并只查询元数据：

```sql
SELECT to_regclass('public.profile_introduction');
SELECT id, hash, created_at
FROM drizzle.__drizzle_migrations
ORDER BY created_at DESC;
```

第一条应返回 `profile_introduction`；第二条用于确认 repository 中尚未执行的 migration 已写入 Drizzle journal。migration 成功且表存在后，才能构建首个 production image 并创建 ECS Service。

### 首个 production 镜像

production image 使用不可变的 `prod-<完整 Git SHA>` tag。为避免 tag 指向与实际源码不一致的镜像，发布脚本会拒绝任何存在 staged、unstaged 或 untracked 文件的工作区。先审查并提交本功能的完整改动，再运行：

```bash
bash infra/scripts/push-go-production-image.sh
```

脚本会重新执行容器内 gofmt/module verify/vet/test，按 `linux/amd64` 构建，检查 runtime 用户为 `65532:65532`，从 foundation stack 读取 ECR URI，登录并推送，最后通过 ECR API 返回镜像 digest。它只发布镜像，不创建 ECS Service；runtime stack 仍需单独审查和批准。

## 阶段 9：production CodeBuild

production pipeline 只信任 `master` 分支的 `PUSH` 事件，并额外使用路径过滤。它会运行 `gofmt`、`go mod verify`、`go vet`、`go test`，构建不可变的 `prod-<40位commit-sha>` 镜像，推送并通过 ECR 查询确认镜像存在；只有这些步骤全部成功后才部署 `go-production.yaml`。

部署会等待 ECS Service 稳定，然后通过现有 API Gateway 地址检查 `/healthz` 和 `/readyz`。更新部署 smoke test 失败时恢复上一个 image tag；首次部署失败时删除失败的 runtime stack。CloudFormation/ECS 稳定失败由 ECS deployment circuit breaker 和 CloudFormation rollback 处理。

### 1. 创建 GitHub CodeConnections connection

在 AWS Console 进入 **Developer Tools → Settings → Connections**，创建 GitHub connection，并只授权目标 repository。连接状态必须为 `AVAILABLE`。该步骤涉及 GitHub 授权，必须由用户在浏览器亲自完成；不要把 OAuth 凭证或 token 发给 Codex。

只完成用户授权而不选择 GitHub App installation 时，connection 仍可能显示 `AVAILABLE`，但 CodeBuild 在创建 webhook 时被 GitHub 拒绝。必须确认 **AWS Connector for GitHub** 已安装到拥有目标 repository 的 GitHub account，并向目标 repository 授予访问及 webhook 权限；否则 CloudFormation 会在 `AWS::CodeBuild::Project` 的 `CreateWebhook` 阶段回滚。

记录 connection ARN，然后确认 production API 已经部署并得到不带尾斜线的 base URL，例如：

```text
https://abc123.execute-api.us-east-2.amazonaws.com
```

### 2. 本地验证模板与安全门

```bash
sam validate --template-file infra/codebuild.yaml --lint
pnpm check:infra
bash -n infra/scripts/deploy-go-production.sh
```

`pnpm check:infra` 会固定 production webhook 为可信 `master` push，并检查部署命令只能出现在构建成功、ECR image marker 验证之后。

### 3. 创建并审查 change set

foundation/IAM stack、ECR、首个 production runtime 与 API Gateway 均验收通过后，用户创建待审 change set：

```bash
aws cloudformation create-change-set \
  --region us-east-2 \
  --stack-name github-account-info-go-codebuild \
  --change-set-name stage9-codebuild-review \
  --change-set-type CREATE \
  --template-body file://infra/codebuild.yaml \
  --parameters \
    ParameterKey=GitHubConnectionArn,ParameterValue=<CONNECTION_ARN> \
    ParameterKey=PublicApiBaseUrl,ParameterValue=<API_GATEWAY_BASE_URL> \
    ParameterKey=CorsOrigins,ParameterValue=<PRODUCTION_CLOUDFLARE_ORIGIN> \
  --capabilities CAPABILITY_IAM \
  --description 'Stage 9 trusted master production CodeBuild; review before execution'
```

预期新增：production/preview 两个 CodeBuild project、各自 log group，以及附加到两个隔离 CodeBuild role 的 connection-use policy。执行前确认 production webhook 只有 `PUSH + refs/heads/master + FILE_PATH`；PR 事件只能出现在 preview project。

### 4. 首次流水线验收

change set 经审查并由用户执行后，可对符合路径过滤的 Go 文件做一次可信 master push，或由用户在 CodeBuild Console 手动启动 production project。验收以下顺序：

1. gofmt、module verify、vet、test 全部通过。
2. ECR 出现 `prod-<完整commit-sha>`，repository 的 immutable tag 策略拒绝覆盖。
3. production stack 的 `ImageTag` 参数变为相同 tag。
4. ECS service stable，API Gateway `/healthz` 与 `/readyz` 均为 200。
5. 人为制造测试失败的独立验证分支不得触发 production webhook；禁止为了测试回滚而向 master 提交故意失败代码。

阶段 10 的 PR pipeline 使用独立 Preview CodeBuild/Execution Role，不能传递 production Execution Role，也不能管理 production stack 或读取 production database Secret。

## 阶段 10：PR 独立环境

### 1. 准备 preview database 与 Secret

使用数据库管理员连接 RDS 后，在 `psql` 中交互式输入随机密码，避免把密码写进 shell history：

```sql
\prompt 'Preview database password: ' preview_password
CREATE ROLE github_account_info_preview LOGIN PASSWORD :'preview_password';
CREATE DATABASE github_account_info_preview OWNER github_account_info_preview;
\unset preview_password
```

不要给该用户授予 production `public` schema 或表权限。使用管理员在 production database 中验证，结果必须均为 false：

```sql
SELECT
  has_table_privilege('github_account_info_preview', 'public.github_account', 'SELECT') AS can_read_accounts,
  has_table_privilege('github_account_info_preview', 'public.profile_introduction', 'SELECT') AS can_read_introductions;
```

随后在 Secrets Manager Console 创建 `github-account-info/preview/database-url`，URL 中 database 名必须是 `github_account_info_preview`，用户名必须是 `github_account_info_preview`。不要把 URL 或密码返回给 Codex。

### 2. Cloudflare Pages 构建契约

Cloudflare Pages 会自动提供 `CF_PAGES_BRANCH` 与 `CF_PAGES_COMMIT_SHA`。Vite 使用完整 commit SHA 生成 `preview-<前12位sha>`；production branch 不注入 header。Pages 项目需要配置：

```text
Production branch: master
VITE_SERVER_URL: production API Gateway base URL
VITE_GO_API_URL: production API Gateway base URL
Build command: pnpm --filter web build
Build output directory: apps/web/dist
```

如果 production branch 不是 `master`，额外设置 `CF_PAGES_PRODUCTION_BRANCH`。不要手工设置 `VITE_PREVIEW_KEY`，除非是在本地做明确的路由测试。

Preview 打开根路径会自动跳到 `/u/preview-user`。浏览器只在 Go public GET 中发送 `X-Preview-Environment`；preview 前端不会获得 production 数据库凭证。production Lambda 显式设置 `MANAGEMENT_API_ENABLED=true`，用于保持当前 account 管理、GitHub PAT 拉取和 introduction generate 行为不变；这是本项目“不新增登录”的兼容性选择，不构成认证。CORS 不能阻止调用者绕过 Cloudflare 直连 API Gateway，因此该生产写入口只适用于当前个人学习项目风险模型，不能作为多用户生产安全边界。

`pr_<number>` schema 用于已审批协作者之间的功能和数据命名隔离，不是恶意多租户隔离。所有 preview task 共用 preview database credential，因此不应批准不可信代码执行；CodeBuild 的 `ALL_PULL_REQUESTS` 审批是执行 PR 代码前的信任门。即使误批，Preview Role/Task 也拿不到独立的 production database Secret。

### 3. PR 生命周期

preview CodeBuild webhook 只接受目标为 `master` 的 PR created/updated/reopened/merged/closed 事件，并使用 `ALL_PULL_REQUESTS` 评论审批策略。部署顺序：

1. 格式、vet、test、Docker build 和 ECR digest 验证。
2. 首次部署先创建 DesiredCount=0 且无 listener rule 的 PR stack。
3. 运行 `/preview-db create`，仅创建 `pr_<number>` 与非敏感 `preview-user` seed。
4. 启用 header listener rule 和单副本 Fargate Spot Service。
5. 携带 preview header 通过 API Gateway smoke test。

PR merged/closed 时顺序相反：先移除 listener rule 与 Service，再运行带精确 `--confirm-schema pr_<number>` 的 drop task，最后删除 PR stack。镜像由 ECR 14 天 lifecycle 兜底清理。

若 GitHub close webhook 遗漏，EventBridge 默认每天 03:00 UTC 启动 `${ProjectName}-preview-ttl-cleanup`。这个 CodeBuild project 使用 `NO_SOURCE`、非 privileged 环境，只扫描同时带 `Project=${ProjectName}`、`Environment=preview` 和有效 `ExpiresAt` 的 CloudFormation Stack；严格匹配 `${ProjectName}-pr-<1..49999>` 且确认过期后，才用 `PULL_REQUEST_CLOSED` 启动已经验收的 preview cleanup build，并等待其成功。EventBridge 复用现有 Preview CodeBuild Role，额外 trust 受 `SourceAccount` 和精确 Rule ARN 限制，因此不新增第五个角色，也不会扫描或删除 production Stack。

由于 ECS 的 `DeregisterTaskDefinition` 不能按 ARN 收紧，Preview Role 不拥有该破坏性权限；preview Task Definition 暂时 Retain。它们不会运行、不会产生 Fargate 费用，但会占 revision 配额，仍由可信管理员按 RUNBOOK 周期审计后注销，不能给执行 PR 源码的 Role 增加通配注销权限。

本地验证：

```bash
sam validate --template-file infra/go-preview.yaml --lint
sam validate --template-file infra/codebuild.yaml --lint
pnpm check:infra
go test ./...
```
