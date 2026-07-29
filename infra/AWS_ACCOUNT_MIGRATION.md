# AWS 账号迁移运行手册

本文是 `github-account-info` 跨 AWS 账号迁移的事实来源。新的 AI 会话或维护者应先
阅读根目录 `AGENTS.md`、本文和 `infra/README.md`，再执行任何云端操作。

迁移不是资源“转户”：目标账号重新创建基础设施，业务数据单独复制，Cloudflare
最后切流。旧账号只有在目标账号完整验收后才能清理。

## 1. 当前自动化边界

| 范围 | 状态 | 事实来源 |
| --- | --- | --- |
| GitHub OIDC Provider 与部署 Role | 已有模板 | `infra/aws-account-foundation.yaml` |
| Node Lambda、API Gateway、VpcLink | 已有模板 | `apps/server/template.yaml` |
| Go ECS、ALB、Cloud Map、IAM、CodeBuild | 已有模板 | `infra/go-*.yaml`、`infra/codebuild.yaml` |
| SNS、SQS、Performance、AI Ops、Synthetics | 已有模板 | `infra/profile-events.yaml` 等 |
| VPC、基础子网、路由、NAT、Internet Gateway | 已有模板 | `infra/aws-network-database.yaml` |
| RDS、DB Subnet Group、基础 RDS/Lambda Security Group | 已有模板 | `infra/aws-network-database.yaml` |
| SSM 堡垒机和 Instance Profile | 可选创建 | `CreateSsmBastion`，默认关闭 |
| Secrets Manager secret value | 不进入 IaC | 必须在目标账号安全重建 |
| GitHub CodeConnections 授权 | 需要人工 OAuth/GitHub App 授权 | `infra/README.md` |
| Cloudflare Pages 项目和变量 | AWS 账号外资源 | 最后切换 API 地址 |

所有物理 ID必须来自 `aws-network-database` Stack Outputs。AI 不能编造 VPC、
Subnet、Security Group、RDS endpoint 或 Secret ARN。

## 2. AI 执行契约

执行者必须遵守：

1. 每个 AWS 写操作使用可审查的 CloudFormation Change Set。
2. 日常 workflow 只使用 GitHub OIDC Role；账号管理员只用于首次 Foundation、
   尚未被项目部署策略覆盖的基础 Stack，以及恢复。每次管理员操作都必须是已审查
   Change Set，不能使用 root 做日常部署。
3. 不把数据库 URL、GitHub token、Secret value、OAuth token 写入 Git、日志、
   参数文件、聊天或 shell history。
4. 每阶段先只读发现，再创建 Change Set，再展示变化，得到批准后执行。
5. 目标账号验收完成前保持源账号在线，禁止删除或停止源数据资源。
6. 文档与实时状态不一致时，以只读 API 为准，更新本文后再继续。

以下任一条件成立时必须停止：

- 当前身份是 root，且操作不是首次 Foundation 创建或 root-only 恢复；
- RDS 没有可在目标账号恢复的独立备份；
- Change Set 有计划外资源、replacement 或账号级通配权限扩大；
- OIDC trust 未严格限制目标 repository 和 `master`；
- 目标账号基础网络 ID 不完整；
- CloudFormation Outputs 只得到一部分；
- 新旧数据库验收结果不一致；
- 用户未批准 Cloudflare 切流或旧账号删除。

## 3. 迁移输入

创建一份不含凭证的工作记录：

```text
SOURCE_AWS_ACCOUNT_ID=
TARGET_AWS_ACCOUNT_ID=
AWS_REGION=us-east-2
GITHUB_REPOSITORY=StarCoderLn/github-account-info
DEPLOYMENT_BRANCH=master
SOURCE_COMMIT_SHA=
PRODUCTION_CLOUDFLARE_ORIGIN=https://github-account-info.pages.dev
SOURCE_API_BASE_URL=
TARGET_API_BASE_URL=
TARGET_VPC_ID=
TARGET_PRIVATE_SUBNET_IDS=
TARGET_LAMBDA_SECURITY_GROUP_ID=
TARGET_RDS_SECURITY_GROUP_ID=
TARGET_GITHUB_CONNECTION_ARN=
```

账号 ID、ARN、URL 和资源 ID不是凭证；Secret value、数据库密码和 token 只能进入
对应 Secret 存储。

## 4. Phase 0：源账号盘点与备份

### 4.1 重新盘点

不要复用旧会话中的物理 ID。至少重新检查：

- 调用身份、账号、Region 和所有项目 Stack 状态；
- RDS engine/version、加密 key alias、backup retention、manual snapshots；
- DynamoDB 表、PITR、记录量；
- ECR repositories 和要保留的 immutable image SHA；
- Secrets 名称，不读取或输出 value；
- VPC、Subnet、Route、NAT、Security Group、堡垒机、Instance Profile；
- GitHub OIDC Provider、部署 Role trust/attached policies；
- CodeConnections 和 Cloudflare 当前生产 API 地址。

2026-07-29 的只读审计仅作提醒，迁移当天必须重查：

- RDS `github-account-info-db` 为 PostgreSQL 16，使用 `alias/aws/rds` 加密；
- automated backup retention 为 `0`；
- AI Ops DynamoDB 表启用了 PITR；
- VPC、RDS、堡垒机、三个 Secrets、OIDC Provider 和 CodeConnection 均未被当前
  CloudFormation Stack 管理。

### 4.2 RDS 数据备份门

必须选择并验证至少一种方案：

**方案 A：`pg_dump` / `pg_restore`（当前项目优先）**

- 导出 production 和确需保留的 preview 数据；
- 加密后保存到不依赖源账号存续的位置；
- 在隔离数据库完成恢复演练；
- 记录 schema、关键表行数和 migration journal 结果。

**方案 B：跨账号 RDS snapshot**

- 创建 manual snapshot；
- `alias/aws/rds` 加密的 snapshot 不能直接跨账号共享；
- 先复制 snapshot，并使用 customer managed KMS key 重新加密；
- KMS key policy 授权目标账号；
- 目标账号复制 shared snapshot 到自己账号后再恢复并验证。

只有目标账号可用的 snapshot copy，或验证过的逻辑备份，才算通过备份门。

### 4.3 其他数据

- DynamoDB incident 历史需要保留时，使用 Export to S3 后在目标账号 Import。
- ECR 镜像从固定 Git commit 重建，不依赖复制旧账号镜像。
- CloudWatch Logs、Synthetics artifacts、SQS 在途消息默认不迁移；如需保留必须
  单独立项。

## 5. Phase 1：目标账号部署身份

使用目标账号管理员创建唯一的账号 Foundation Change Set：

```bash
aws cloudformation create-change-set \
  --region us-east-2 \
  --stack-name github-account-info-aws-account-foundation \
  --change-set-name account-foundation-review \
  --change-set-type CREATE \
  --template-body file://infra/aws-account-foundation.yaml \
  --parameters file://infra/parameters/aws-account-foundation.example.json \
  --capabilities CAPABILITY_NAMED_IAM
```

目标账号已有 `token.actions.githubusercontent.com` Provider 时，把
`ExistingGitHubOidcProviderArn` 改为真实 ARN；禁止创建第二个同 URL Provider。

执行前确认：

- 只新增一个 OIDC Provider（复用时为零个）和一个 IAM Role；
- trust `sub` 精确等于
  `repo:StarCoderLn/github-account-info:ref:refs/heads/master`；
- 没有 IAM User、Access Key、repository wildcard 或 `AdministratorAccess`。

执行后把 `DeploymentRoleArn` Output 设置为 GitHub Repository Variable：

```text
AWS_DEPLOY_ROLE_ARN=<DeploymentRoleArn output>
```

三个 workflow 只读取这个变量，不允许重新写死账号 ID。先用“只创建 policy Change
Set”的人工 workflow 验证 OIDC；身份必须属于目标账号的
`assumed-role/github-actions-deployer/...`。

`aws-account-foundation.yaml` 附加的五个 AWS managed policies 用于复现现有部署
能力，不代表最终最小权限。项目权限继续由 `server-deployer-policy.yaml`、
`performance-deployer-policy.yaml` 和 `ai-ops-deployer-policy.yaml` 管理；迁移
稳定后应单独收紧 baseline policies，禁止临时附加 `AdministratorAccess`。

## 6. Phase 2：目标网络、数据库与 Secrets

复制 `infra/parameters/aws-network-database.example.json` 为被 Git 忽略的
`aws-network-database.local.json`，创建并审查：

当前 GitHub OIDC baseline policy 不拥有整套 EC2/RDS/KMS 创建权限，因此这个首次
基础 Stack 仍由目标账号管理员通过 Change Set 创建；不能改用 root，也不能为了
省一步给 workflow 临时附加 `AdministratorAccess`。后续如需完全自动化，应新增
专用 CloudFormation execution role，并只允许 OIDC Role `PassRole` 给该角色。

```bash
aws cloudformation create-change-set \
  --region us-east-2 \
  --stack-name github-account-info-aws-network-database \
  --change-set-name network-database-review \
  --change-set-type CREATE \
  --template-body file://infra/aws-network-database.yaml \
  --parameters file://infra/parameters/aws-network-database.local.json \
  --capabilities CAPABILITY_NAMED_IAM
```

模板创建：

- 启用 DNS support/hostnames 的 VPC；
- 一个 public egress subnet 和两个不同 AZ 的 private subnets；
- Route Tables、Internet Gateway，以及在线模式所需 NAT Gateway；
- Lambda/RDS Security Groups和 Lambda → RDS 精确 5432 入站；
- 使用 customer managed KMS key、7 天自动备份、删除保护和 snapshot 删除策略的
  PostgreSQL RDS；
- 默认不创建、可选启用的零入站 SSM 堡垒机。

`CreateNatGateway=false` 只允许用于 dormant restore preparation；该状态不能正常
运行需要公网 GitHub API、ECR、Logs、Secrets Manager 或 SSM 的完整线上项目。

跨账号 snapshot 路径分两步：

1. 先以 `CreateDatabase=false` 创建网络和目标 KMS key；
2. 用 `DatabaseKmsKeyArn` Output 在目标账号复制 shared snapshot；
3. 更新 Stack：`CreateDatabase=true` 且 `DBSnapshotIdentifier=<target-copy>`。

新建空数据库时，Stack 自动生成并保留 administrator Secret，RDS 使用动态引用，
参数文件不接触密码。该 Secret 是 JSON 管理员凭证，不是应用使用的完整 URL。

在目标 Secrets Manager 创建：

```text
github-account-info/production/database-url
github-account-info/preview/database-url
github-account-info/ai-ops/github-models-token
```

production 和 preview 必须使用不同 database/user 权限边界。不能复制旧 ARN。

Secrets 与两个 Foundation Stack 就绪后生成下游参数：

```bash
TARGET_AWS_ACCOUNT_ID=<target-account-id> \
PRODUCTION_DATABASE_SECRET_ARN=<target-production-secret-arn> \
PREVIEW_DATABASE_SECRET_ARN=<target-preview-secret-arn> \
pnpm migration:render-aws-parameters
```

脚本强制校验当前 AWS identity 属于目标账号，只读取 Stack Outputs，不读取 Secret
value，并生成：

```text
infra/parameters/go-foundation.local.json
infra/parameters/go-iam.local.json
infra/parameters/migration-target.local.json
```

最后一个文件列出需要设置的 `AWS_DEPLOY_ROLE_ARN`、
`AWS_LAMBDA_SUBNET_IDS` 和 `AWS_LAMBDA_SECURITY_GROUP_IDS`。首次目标账号 SAM
部署必须显式提供这些目标账号值；模板不再包含任何源账号物理 ID默认值。

需要人工数据库隧道时运行 `pnpm db:tunnel`。脚本按 `${ProjectName}-bastion` 标签和
`${ProjectName}-db` identifier 在当前账号实时发现资源，不保存 Instance ID或 RDS
endpoint；迁移期间设置 `TARGET_AWS_ACCOUNT_ID` 可防止连错账号。

## 7. Phase 3：目标账号部署顺序

固定使用同一个已审查 Git commit：

1. `github-account-info-aws-account-foundation`
2. `github-account-info-aws-network-database`
3. production/preview/model Secrets
4. `github-account-info-go-foundation`
5. `github-account-info-go-iam`
6. `github-account-info-server-deployer-policy`
7. `github-account-info-profile-events`
8. 首个 Go production ECR image
9. `github-account-info-go-production`
10. `github-account-info-performance-deployer-policy`
11. Performance 首次以 `DesiredCount=0` 创建
12. Performance image、database migration，再更新为目标 DesiredCount
13. `github-account-info-ai-ops-deployer-policy`
14. AI Ops model Secret 与 `github-account-info-ai-ops`
15. Node/SAM `github-account-info`
16. GitHub CodeConnection 与 `github-account-info-go-codebuild`
17. `github-account-info-synthetics`
18. Cloudflare Pages variables 与生产构建

跨 Stack Outputs 必须从目标账号实时读取。禁止复制源账号的 Queue URL、Table ARN、
Listener ARN、ECR URI 或 API ID。

首次 Node/SAM CREATE 得到目标 `ApiUrl` 后，再设置部署环境：

```text
PUBLIC_API_BASE_URL=<target ApiUrl>
CORS_ORIGIN=<production Cloudflare origin>
PROFILE_EVENTS_TOPIC_ARN=<target profile topic ARN>
AWS_DATABASE_URL=<target production database URL>
AWS_LAMBDA_SUBNET_IDS=<target subnet IDs, comma-separated>
AWS_LAMBDA_SECURITY_GROUP_IDS=<target security-group IDs, comma-separated>
```

目标 API 尚不存在时，不能使用旧账号 `PUBLIC_API_BASE_URL` 做 smoke test。

## 8. Phase 4：数据、切流与验收

1. 在目标 RDS 应用全部 Drizzle migrations并恢复 production 数据。
2. 校验 migration journal、关键表行数和抽样数据。
3. 源站仍允许写入时，安排短暂停写窗口并执行最终同步。
4. 验证目标账号：
   - Lambda alias、API Gateway route、`/`、`/healthz`、`/readyz`；
   - account read/write 和 introduction read/generate；
   - SNS → SQS → consumer；
   - Performance 入队、ECS 清洗、数据库回读；
   - AI Ops 入队与 incident 回读；
   - ECS desired/running、ALB target health；
   - GitHub Actions 身份和资源 ARN全部属于目标账号。
5. 更新 Cloudflare `VITE_SERVER_URL`、`VITE_GO_API_URL` 和 Performance variables。
6. 重新构建、切流并在约定观察窗口监控新旧账号。

全部通过后才记录 `TARGET_ACCEPTED=true`。

## 9. 回滚

切流后出现问题时：

1. Cloudflare 切回源 API；
2. 停止目标数据库写入；
3. 保留目标 Stack 和日志作为调查证据；
4. 确认源数据库仍为权威写入源；
5. 修复后重新执行 Phase 4。

迁移失败不授权删除源账号任何资源。

## 10. 源账号清理

只有 `TARGET_ACCEPTED=true`、独立备份可恢复且用户明确批准后才能开始。先禁用源
部署触发器，确认 Cloudflare 和 GitHub Variables 均指向目标，再反向删除：

1. PR preview Stacks
2. Synthetics、CodeBuild
3. AI Ops、Performance、Profile Events
4. Node/SAM API
5. Go production、Go IAM、Go foundation
6. 未纳管的 RDS、堡垒机、NAT 和网络
7. supplemental deployer-policy Stacks
8. account foundation Role/OIDC（确认无其他 repository 使用）

Stack 删除后继续检查 `DeletionPolicy: Retain` 遗留：

- ECR repositories/images、CloudWatch Log Groups；
- DynamoDB tables、S3 Canary bucket/objects；
- RDS manual snapshots、Secrets Manager secrets；
- ENI、NAT Gateway、Elastic IP；
- CodeConnections、OIDC Provider；
- Marketplace subscriptions、Reserved Instances、Savings Plans。

最后在所有 Region 和全局服务做只读费用盘点并观察 Billing。删除资源不会消除已经
产生的账单。

## 11. 完成记录

```text
SOURCE_COMMIT_SHA=
TARGET_ACCOUNT_ID=
TARGET_REGION=
ACCOUNT_FOUNDATION_STACK_STATUS=
DATABASE_BACKUP_ID=
DATABASE_RESTORE_VERIFIED_AT=
TARGET_API_URL=
CLOUDFLARE_CUTOVER_AT=
TARGET_ACCEPTED=true
SOURCE_CLEANUP_APPROVED_BY=
SOURCE_CLEANUP_COMPLETED_AT=
POST_CLEANUP_BILLING_REVIEW_AT=
```

没有这些证据时，AI 只能写“迁移准备完成”或“目标部署完成”，不能写“账号迁移全部
完成”。
