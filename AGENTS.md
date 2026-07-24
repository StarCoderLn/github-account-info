# 项目踩坑与教训（AGENTS.md）

编号格式为 `F<Feature>-L<Lesson>`：`F` 对应 `specs/` 下的功能目录编号，`L` 是该
功能内唯一的经验序号。编号只用于稳定检索和追溯，不复用 tasks.md 的 `T-xxx`。

## Feature 1：GitHub 账号获取

- [F1-L01] GitHub REST API 坑：不带 `User-Agent` 头会被直接拒绝（403）。所有调用 `api.github.com` 的请求必须显式注入 `User-Agent`，同时带 `Accept: application/vnd.github+json` 和 `X-GitHub-Api-Version: 2022-11-28`。
- [F1-L02] GitHub 403 语义重载坑：401 表示 token 无效，但 403 既可能是“限流”也可能是“权限不足”，必须读响应头 `x-ratelimit-remaining === "0"` 区分，不能笼统映射为同一种错误。
- [F1-L03] fetch 超时坑：用 `AbortSignal.timeout(ms)` 触发的超时会抛出 `DOMException`，且 `name === "TimeoutError"`（不是 `AbortError`）。catch 必须按 `TimeoutError` 判断，否则会误报为普通网络错误。
- [F1-L04] 凭证安全约定：第三方 token（如 GitHub PAT）只允许出现在请求头里，禁止写日志、禁止随响应返回调用方。service 层抛语义化自定义错误，由路由层统一映射为 `TRPCError`，token 不外泄。
- [F1-L05] Drizzle schema GitHub ID 类型陷阱：GitHub 用户 ID 会超过 32 位整型上限（2,147,483,647）。必须用 `bigint("github_id", { mode: "number" })` 映射为 PostgreSQL bigint。存储任何外部平台数值 ID 前都要先确认范围，不能默认使用 `integer`。

## Feature 3：账号管理页面

- [F3-L01] shadcn 组件底层是 `@base-ui/react` 而非 Radix UI：本项目 Dialog、AlertDialog 等 primitive 来自 `@base-ui/react/<component-name>`。动画状态使用 `data-open:` / `data-closed:`，不能直接照搬 Radix 的 `data-[state=open]:` / `data-[state=closed]:`。
- [F3-L02] TanStack Router `routeTree.gen.ts` 禁止手动编辑：该文件由开发服务器（`pnpm dev:web`）根据 `apps/web/src/routes/` 自动生成。新增路由只创建 route 文件并声明 `createFileRoute(...)`。
- [F3-L03] tRPC 行类型推导约定：前端消费 procedure 输出时，用 `inferRouterOutputs<AppRouter>` 推导，禁止手写与后端重复的 interface，避免后端字段变更后出现静默不一致。
- [F3-L04] 前后端可选字符串字段边界：前端表单常用空字符串表示“未填”，后端 nullable 列接收的是 `null | undefined`。调用 mutation 前必须显式把 `""` 转为 `null`，不能依赖隐式转换。
- [F3-L05] Base UI Dialog 双关闭按钮坑：`DialogContent` 默认渲染右上角关闭按钮。若 Footer 还放文字关闭按钮，应传 `showCloseButton={false}` 或删除 Footer 按钮，避免重复入口。
- [F3-L06] 实现文件名须与 spec 一致：创建文件前先核对 `specs/` 中 design.md 的命名，避免 review 后再重命名并同步全部 import。
- [F3-L07] update mutation 必须与 create 保持一致的错误处理：若 create 捕获数据库唯一约束并映射为 `CONFLICT`，update 也必须加入相同守卫，不能把内部数据库错误直接抛给客户端。
- [F3-L08] 敏感 token 用完即清：GitHub PAT 等临时凭证完成请求后，要在成功路径立即清除 state 并 reset mutation，不能等待 Dialog 关闭，否则凭证会在 React state 中额外存留一个渲染周期。

## Feature 4：Go 个人主页与容器平台

- [F4-L01] SSM 隧道下的 Node PostgreSQL TLS 坑：`pg@8`/当前 `pg-connection-string` 会把 `sslmode=require` 按 `verify-full` 处理，而隧道地址 `127.0.0.1` 无法匹配 RDS 证书主机名。仅本机 SSM port-forward migration 使用 `sslmode=require&uselibpqcompat=true`；production Go Task 直连真实 RDS hostname 时仍使用 `verify-full`。
- [F4-L02] CloudFormation 控制面权限不等于底层资源权限：`AWSCloudFormationFullAccess` 只允许操作 Stack/Change Set，不自动授予 `logs:ListTagsForResource`、`logs:CreateLogDelivery` 或 `cloudwatch:PutMetricAlarm`。部署失败应从 Events 中最早的具体 `*_FAILED` 找根因；`Resource update cancelled` 通常只是连带结果。
- [F4-L03] 紧急 inline policy 只能用于恢复：最终权限事实来源必须迁回 IaC 管理的 customer managed policy，并按“先附加并验收、后删除 inline”处理，避免权限空窗；禁止用 `CloudWatchFullAccess` 掩盖精确权限缺口。

Feature 4 的完整 AWS/Cloudflare 实测证据位于
`specs/4.go-profile-platform/verification.md`；本节只保留可复用的工程教训。

## Feature 5：运行稳定性与异步事件链路

- [F5-L01] `alias/aws/sqs` 不适合当前 SNS → SQS 加密链路：该 AWS 托管 KMS key 的策略不能为 SNS 补充所需的 `GenerateDataKey`/`Decrypt` 权限，会出现 SNS 接受发布但消息无法进入队列。当前方案使用 SSE-SQS；若必须使用 KMS，应改用可管理 policy 的 customer managed key，并评估固定费用。
- [F5-L02] SQS Lambda consumer 必须同时实现 partial batch failure 并在 event source mapping 启用 `ReportBatchItemFailures`。只返回失败 record 的 `itemIdentifier`，否则一条坏消息会让同批成功消息重复消费。
- [F5-L03] SNS publish 成功不等于事件链路成功：验收必须继续检查 SQS 指标、consumer 日志及业务回读结果。DLQ 演练使用“契约合法但业务不存在”的测试事件，问题修复前禁止 redrive；人工查看主队列也会改变 receive count 和 visibility。
- [F5-L04] Lambda alias 灰度的前提是 API Gateway integration 和 `AWS::Lambda::Permission` 都指向 `live` alias。若仍调用函数 ARN 或 `$LATEST`，配置 `AdditionalVersionWeights` 也不会影响真实流量；发布结束还要显式清空旧附加权重。
- [F5-L05] 当前账号无法启用 CodeDeploy（`SubscriptionRequiredException`），Node 灰度因此使用 Lambda 原生 alias 权重。账号能力是部署设计输入，不能先假定某项 AWS 服务必然可用。
- [F5-L06] 带 Cloud Map Service Registry 的 ECS Service 不能直接套用所需的原生 Canary strategy。当前使用 Stable/Canary 双 Service：只有 Stable 注册 Cloud Map，Canary 只接入公网备用 Target Group，避免内部写链路提前命中新版本。
- [F5-L07] ALB weighted target groups 只负责按权重分流，不会在某组为空或不健康时自动把流量转移到另一组。发布脚本必须先等待 Canary target healthy，再开放权重；失败时同时恢复旧镜像、100/0 权重和 Canary `DesiredCount=0`。

Feature 5 的云端验收结果和保留的 DLQ 故障注入状态位于
`specs/5.operational-resilience/tasks.md` 与运行手册中。

## Feature 6：AI Ops Agent

- [F6-L01] AI Ops 工具边界：模型不能直接接收 ARN、URL、shell 或 Logs Insights query。所有工具输入只能是共享 schema 中的 component/queue enum，再由本地 resource catalog 映射固定资源；日志必须先脱敏、截断再进入模型。
- [F6-L02] Agent 结论不是事实来源：Mastra 输出必须经 `investigationSchema` 校验，hypothesis 只能引用真实 evidence ID；证据不足时 `rootCause` 为 `null`。第一版 investigator role 禁止 ECS、Lambda、CloudFormation、SQS 写操作，remediation 永远要求人工审批。
- [F6-L03] GitHub Models 凭证约定：ChatGPT 会员不能充当 API key。运行时使用只含 `models:read` 的独立 GitHub token，value 只存 Secrets Manager；模板、参数文件、环境变量、队列、prompt 日志和 API 响应只能出现 Secret ARN 或公开 model ID。
- [F6-L04] AWS root 不能作为日常部署身份：即使当前本地 AWS 凭证解析为 root，也只能用于账号恢复和极少数 root-only 操作。应用部署统一使用 GitHub Actions OIDC 短期凭证；先核对 role trust policy 的 repository/branch subject。本项目现有 deployer role 只信任 `master`，feature branch 不能直接部署。
- [F6-L05] AI Ops 完成状态必须分层记录：“代码侧 MVP、部署准备、云端部署、真实链路验收”是四个不同里程碑。测试、构建和 SAM 静态校验通过只说明前两层完成；stack、Secret、服务接入和故障演练完成前，禁止写成“已全部完成”。
- [F6-L06] GitHub Models 免费额度是容量边界：默认 `openai/gpt-4.1` 需要 tool calling 和结构化输出；免费 High 档当前按 10 RPM/50 RPD 规划。单次调查最多 4 个模型 step，保守容量约 12 次完整调查/日。外部限额可能变化，上线前必须复核，且禁止静默回退到可能收费的 provider。
- [F6-L07] 部署前资源发现也需要显式最小权限：AI Ops workflow 在创建 CloudFormation Change Set 前，会用 `sqs:GetQueueAttributes` 将现有 profile events Queue URL 解析为 ARN。部署策略不能只覆盖将要创建的 AI Ops 队列，还要为 `${ProjectName}-profile-events` 与 `${ProjectName}-profile-events-dlq` 单独授予只读 `sqs:GetQueueAttributes`；不要为了资源发现授予 `sqs:*` 或消息读写权限。真实部署验证时应区分“构建/打包成功”和“Change Set 已创建”，后者失败不代表已有运行时资源。
- [F6-L08] `execute-change-set` 返回成功不等于 Stack 部署成功：GitHub Actions 必须在执行前读取 stack 状态，`REVIEW_IN_PROGRESS` 等待 `stack-create-complete`，已有 stack 等待 `stack-update-complete`，否则 CloudFormation 已进入回滚时 workflow 仍会误报 Success。CloudWatch Logs 的创建权限还要同时覆盖固定 Log Group 的精确 ARN 与 `:*` 子资源 ARN；失败栈清理必须单独手工触发，并只允许 `ROLLBACK_COMPLETE`/`CREATE_FAILED`，禁止泛化为任意 Stack 删除。
- [F6-L09] Lambda reserved concurrency 受账号总并发配额约束：设置 `ReservedConcurrentExecutions: 1` 仍可能因为 AWS 要求至少保留 10 个 unreserved concurrency 而创建失败。低配额账号的 SQS consumer 应避免占用 reserved pool，改用 event source `MaximumConcurrency: 2` 与 `BatchSize: 1` 控制并发和单次模型调用量；不要通过申请更高配额或取消所有并发边界掩盖部署问题。
- [F6-L10] CloudFormation 创建失败回滚时，带 `DeletionPolicy: Retain` 的资源会脱离 stack 继续存在，删除失败 stack 也不会移除它们，下一次创建可能因同名资源冲突再次失败。清理 workflow 必须先限制 stack 状态为 `ROLLBACK_COMPLETE`/`CREATE_FAILED`，等待 stack 删除完成，再按完整固定名称逐个删除本功能遗留的 DynamoDB 表和 Log Group；禁止使用通配符、前缀批量删除，也不能顺带删除模型 Secret、部署策略栈或其他业务资源。
- [F6-L11] SAM 自动生成的 EventBridge Rule 物理名会受 CloudFormation 长度限制截断，不能假定它仍包含逻辑名称中的完整 `ai-ops` 前缀。若部署角色按规则 ARN 做最小权限约束，`AWS::Serverless::Function` 的 `EventBridgeRule` 必须显式设置稳定的 `RuleName` 并让策略精确匹配；不要为迁就自动名称而把 `events:*` 或资源通配符扩大到整个账号。
- [F6-L12] CloudFormation `describe-change-set` 的响应不提供可依赖的 `ChangeSetType` 字段；用 `--query ChangeSetType` 会得到 `None`，从而把 CREATE 错判为 UPDATE 并让 Actions 在成功栈上长时间等待错误 waiter。执行 Change Set 前应读取 stack 的 `StackStatus`：新建 Change Set 的空壳 stack 为 `REVIEW_IN_PROGRESS`，据此选择 create waiter；其他已存在 stack 使用 update waiter。
