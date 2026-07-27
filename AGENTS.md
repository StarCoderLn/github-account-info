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
- [F3-L09] 账号可见不等于账号可管理：共享数据库中的账号记录只代表公开可见，当前浏览器必须持有 login 匹配的本地 Token 才能展示编辑、删除和生成入口；无 Token 账号只能进入公开只读页。前端门禁只用于当前单用户作业的交互边界，若扩展为多用户系统，必须引入服务端身份与资源归属校验，不能把 localStorage 当成真正的授权机制。

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
- [F6-L13] 跨 stack 接入不要在 GitHub Secrets/Variables 重复维护 DynamoDB/SQS 物理标识：Node Canary 部署应从 `github-account-info-ai-ops` 的 CloudFormation Outputs 读取事件表 Name/ARN 与队列 URL/ARN，再作为 SAM 参数注入。为兼容未部署 Agent 的环境，stack 不存在时允许四项全空；一旦 stack 存在，四项必须同时完整，否则立即失败，禁止带半套配置继续发布。
- [F6-L14] esbuild 的 ESM banner 若注入 `import { createRequire }`，可能与被打包依赖保留的同名顶层 import 冲突；构建本身仍会成功，但 Lambda 冷启动报 `Identifier 'createRequire' has already been declared`。banner helper 必须使用项目私有别名（如 `__createRequire`），并在部署前用目标 Node 版本直接 import 最终 `.mjs` bundle；只跑 TypeScript、单测和 esbuild 不能覆盖运行时模块解析错误。
- [F6-L15] Mastra 的 `structuredOutput` 校验可能在 `agent.generate()` 内抛出 `id === "STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED"`，不能只在返回后检查 `result.object`。该错误应包装为领域内 `InvalidModelOutputError` 并把事件写成非重试的 `INVALID_MODEL_OUTPUT`；其他 provider/网络错误才进入 SQS partial retry。Prompt 仍需明确列出唯一允许的字段，不能假定 provider 一定严格服从 response schema。
- [F6-L16] DynamoDB 文档必须持续满足共享 `incidentSchema`，不能为“清空失败”使用 `REMOVE failure`，因为非失败状态的契约也是 `failure: null` 而不是字段缺失。`begin` 和 `complete` 必须显式写 `failure = :null`，否则 investigating/completed 记录会让 `/ops` 的 list/get 在解析时返回 500。
- [F6-L17] 健康调查时模型可能返回语义合理但不属于内部枚举的 `severity: "none"` / `risk: "none"`。不要为 provider 习惯扩散修改共享 schema 和页面状态；在模型 conclusion 边界接受 `none` 并归一化为内部最低等级 `low`，再执行最终 `investigationSchema` 校验和持久化。
- [F6-L18] 收紧持久化 schema 后必须兼容已经写入的旧文档：早期 incident 缺少后来新增的 nullable `failure` 字段时，严格解析会让一条旧记录拖垮整个 `ops.list`。应在 DynamoDB 读取边界仅对已知旧形态把缺失字段归一化为 `null`，同时继续拒绝非空的非法值；不要放宽共享 schema，也不要为了修复读取问题用 root 批量改历史数据。
- [F6-L19] 工作台双栏布局不能让短侧栏被长详情栏强制拉成等高，同时又给侧栏内部列表写死固定高度；这会造成列表内容被裁切、卡片底部留下大片空白。Grid 应使用 `items-start`，侧栏 `self-start`，真实列表按内容增长到视口上限后再独立滚动；只有 loading 和空状态保留固定占位高度。Sticky 的 `top` 还必须按实际导航是否吸顶计算：非 sticky 导航滚出视口后应使用小间距，不能机械套用导航高度而让侧栏悬在页面中部。

## Feature 7：性能 SDK 与可视化统计

- [F7-L01] 浏览器 SDK 只能对共享 Zod schema 做 `import type`：若为读取
  `schemaVersion`、batch size 等常量而运行时 import schema package，Vite 会把
  Zod 一并打入性能采集 chunk，监控代码反而增加被监控页面负担。协议常量在 SDK
  内保持字面量并由契约测试校准，运行时校验保留在服务端和 processor。
- [F7-L02] CloudWatch Logs subscription 不能直接把日志推给 ECS；其原生目标是
  Lambda、Kinesis、Firehose、OpenSearch 等。浏览器性能链路若明确要求 ECS 清洗，
  应使用凭证隔离的 HTTP 入口 → SQS → 独立 ECS consumer，而不是让浏览器持有
  AWS 凭证或轮询 CloudWatch。
- [F7-L03] ECR repository 和 ECS Service 位于同一个首次创建的 Stack 时，镜像在
  repository 创建前不可能存在。首次 Change Set 必须 `DesiredCount=0`，执行后
  推送不可变 `prod-<sha>` 镜像，再用 UPDATE Change Set 把 DesiredCount 调为 1；
  不要用 mutable `latest` 或反复重启失败 Service 绕过部署顺序。
- [F7-L04] 百分位数不可组合：多个批次的 p75 不能通过平均得到总体 p75。低量 MVP
  保留清洗样本并用 PostgreSQL `percentile_cont` 查询真实 p50/p75/p95；规模增长
  后应存 histogram/可合并 sketch，而不是预聚合裸百分位数。
- [F7-L05] ECS SQS consumer 必须区分永久拒绝和暂时失败：JSON/schema/时间窗非法
  的消息记录稳定原因后确认消费，数据库或 AWS 暂时故障则不删除并等待重试/DLQ。
  若把所有非法输入都抛回队列，一条毒消息会无意义消耗五次处理并污染 DLQ。
- [F7-L06] 仓库声明 `packageManager: pnpm@10.24.0` 且使用 pnpm catalog；执行安装
  必须通过 `corepack pnpm`。系统全局 pnpm 7 无法解析 catalog/当前 lockfile，
  还会尝试重建 node_modules，不能用全局版本更新依赖。
- [F7-L07] Node API 已有 `GET /api/v1/{proxy+}` 指向 Go VPC Link；新增性能入口
  必须声明精确的 `POST /api/v1/performance/events` 和 OPTIONS Lambda integration，
  同时更新 route boundary 静态测试。不能把 POST 加到 Go wildcard，否则会把
  浏览器采集流量错误转入 Go API。
- [F7-L08] production ECS 直连真实 RDS hostname 时必须加载 RDS CA 并启用证书
  校验；只有本地 SSM `127.0.0.1` migration 才使用 `uselibpqcompat=true` 兼容
  hostname 不匹配。processor 镜像复用受版本控制的区域 CA bundle，不使用
  `rejectUnauthorized: false`。
- [F7-L09] 低流量作业型 ECS consumer 不应默认常驻：Performance stack 首次创建
  和日常闲置都保持 `DesiredCount=0`，仅在验收窗口通过 OIDC + 人工审查 Change
  Set 切到 1，结束后再以 Change Set 恢复 0；禁止直接更新 ECS Service 造成
  CloudFormation drift，也禁止使用本机 root 凭证部署。
- [F7-L10] 私有 RDS 的生产迁移不能依赖 GitHub-hosted runner 直连，也不能为了
  省事用本机 root 开 SSM 隧道。复用已审查的 ECS Task Definition，在 private
  subnet 内运行 `PERFORMANCE_PROCESSOR_MODE=migrate` 一次性 Fargate Task；迁移
  文件随不可变镜像发布，Secret 只由 ECS 注入，workflow 只等待精确 task 的 exit
  code，并在失败或取消时停止该 task。
- [F7-L11] 新功能共用生产数据库时，迁移成功和“原功能未受影响”是两项独立证据。
  先审查新增 migration 只包含预期的 additive DDL，再核对一次性任务退出码和日志，
  最后对原有读路径做只读冒烟；不能仅凭 migration command 返回 0 就断言兼容。
- [F7-L12] 低流量监控页面经常只有一个时间桶；单点不能按普通折线的首个 x 坐标
  和满量程 y 坐标绘制，否则会留下大片空白并暗示不存在的趋势。单样本应居中展示、
  保留基线和量级语境，并明确提示更多样本到达后才形成连续趋势。
- [F7-L13] SPA 的页面访问不能只在 SDK `start()` 时记录一次：应用内路由跳转不会
  重新执行入口文件。应订阅 Router 已完成的 path change，并把 route 在事件创建时
  固化、删除 query/fragment；SDK 延迟加载前的跳转使用有上限的内存队列暂存，同时
  跳过首次 Router resolve，避免首访重复计数。
- [F7-L14] ECS consumer 的 `DesiredCount=0` 只省费用，不会自动处理 SQS；若页面
  需要低成本的准实时统计，应为精确 Service 注册 `MinCapacity=0`、
  `MaxCapacity=1` 的 scalable target。scale-out 观察 visible backlog，scale-in
  必须同时观察 visible 与 in-flight 并要求连续空闲，避免数据库写入期间停 task；
  部署和验收仍通过 reviewed Change Set，不能直接 `ecs update-service`。
- [F7-L15] 统计筛选改变 React Query key 时，不能再次进入整页首次加载分支，否则
  页面会闪白并丢失当前阅读位置。筛选查询应使用 `keepPreviousData` 保留上一份
  成功结果、后台拉取新数据，并只在页面内提示“正在更新”；后台刷新失败时继续展示
  旧数据，只有首次请求且没有任何可用数据时才显示整页 loading/error。
