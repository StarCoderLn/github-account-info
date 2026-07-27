# Feature 7：性能 SDK 与可视化统计需求

## 背景

现有项目已经具备 API Gateway、Node Lambda、Go ECS、CloudWatch Logs、
SNS/SQS/DLQ、PostgreSQL、React/tRPC 管理页面和 AI Ops 调查能力。Feature 7
在这些设施上实现一套项目内使用的浏览器真实用户监控（RUM）闭环，不建设通用
APM 平台。

## 目标

1. 提供框架无关的浏览器性能 SDK，采集并批量上报真实用户性能数据。
2. 通过 `POST /api/v1/performance/events` 接收事件，浏览器不持有 AWS 凭证。
3. 使用 SQS 解耦采集入口和清洗服务，失败消息进入 DLQ。
4. 使用独立 ECS Service 清洗、脱敏、归一化并持久化事件。
5. 在 `/performance` 页面完整展示 LCP、INP、CLS、FCP、TTFB 五项指标。
6. 将清洗后的结构化事件写入 CloudWatch Logs，支持审计和后续 AI Ops 调查。

## 功能需求

- [ ] F-001：共享包 `@github-account-info/performance-schema` 必须定义版本化事件、
  批次、清洗事件和统计查询 schema。
- [ ] F-002：SDK 必须采集 LCP、INP、CLS、FCP、TTFB，且每项只使用官方
  `web-vitals` 回调初始化一次。
- [ ] F-003：SDK 必须支持页面加载、资源请求、前端异常和自定义事件。
- [ ] F-004：SDK 必须按最多 20 条或 5 秒批量上报；页面隐藏时优先使用
  `sendBeacon`，否则回退 `fetch keepalive`。
- [ ] F-005：SDK 不得采集 query、fragment、Cookie、Authorization、请求体、
  响应体、GitHub PAT 或用户输入。
- [ ] F-006：采集入口固定为 `POST /api/v1/performance/events`，单批最多 50 条，
  请求体最大 64 KiB，合法请求返回 202。
- [ ] F-007：入口 Lambda 只完成大小限制、schema 校验和 SQS 入队，不计算统计、
  不直接写数据库。
- [ ] F-008：主队列使用 SSE-SQS、长轮询和 DLQ，连续失败五次后隔离 14 天。
- [ ] F-009：ECS processor 必须再次校验 schema，完成 URL 归一化、字段截断、
  敏感信息删除、时间范围检查和 `eventId` 幂等写入。
- [ ] F-010：契约非法事件必须记录拒绝原因并确认消费；数据库或 AWS 暂时失败必须
  留在队列重试。
- [ ] F-011：清洗后的每条事件必须作为单行 JSON 写 stdout，并通过 `awslogs`
  写入独立 CloudWatch Log Group。
- [ ] F-012：PostgreSQL 必须保存清洗后的事件，并按 app/environment/time、
  metric/time、route/time 建立索引。
- [ ] F-013：统计 API 必须返回五项指标的 p50、p75、p95、样本量和评级，不能
  通过平均多个批次百分位数计算。
- [ ] F-014：统计 API 必须支持最近 1 小时、24 小时、7 天以及 environment、
  release、route 筛选。
- [ ] F-015：`/performance` 第一屏必须同时展示 LCP、INP、CLS、FCP、TTFB
  五项 p75，并展示错误率、访问量和处理延迟。
- [ ] F-016：页面必须提供五项指标趋势、按 route 的五项 p75 表格、慢请求和
  错误分布；无样本时显示明确空状态。
- [ ] F-017：前端 procedure 输出类型必须通过 `inferRouterOutputs<AppRouter>`
  推导，不手写重复接口。
- [ ] F-018：页面访问事件必须覆盖首次文档加载和 TanStack Router 的真实 path
  切换；query/hash 变化不重复计数，SDK 延迟加载期间的路由事件不得静默丢失。

## 非功能需求

- [ ] NF-001：SDK 任何异常都不得影响宿主页面；内存队列最多保留 100 条。
- [ ] NF-002：SDK 必须支持采样率，生产默认值由调用方显式配置。
- [ ] NF-003：session ID 必须是匿名随机值，只保存在当前 tab 的内存中。
- [ ] NF-004：processor 为独立 ECS Service，不与 Stable/Canary Go API 共用进程。
- [ ] NF-005：processor 使用最小任务角色，只允许消费指定队列、写指定日志组并
  读取现有数据库 Secret。
- [ ] NF-006：原始 IP、User-Agent、用户 ID 和用户名不得写入性能事件表。
- [ ] NF-007：事件默认保留 7 天，清理任务只删除明确早于保留边界的性能事件。
- [ ] NF-008：所有 package 自己提供适用的 test/check-types/build 任务，根目录
  只通过 Turborepo 调度。
- [ ] NF-009：低流量 processor 必须允许 ECS Service 缩容到 0；SQS 出现积压时
  自动扩到最多 1 个 task，可见和处理中消息连续排空后才允许缩回 0。

## 第一版不做

- 通用多租户 APM、OpenTelemetry Collector 或跨账号日志平台。
- OpenSearch、Kinesis、Timestream、Athena 实时查询。
- Session Replay、DOM 快照、用户输入录制或完整 URL。
- Source map 上传和堆栈符号化。
- 浏览器直连 CloudWatch 或任何 AWS 服务。
- 将 processor 合并到 Go API Stable/Canary Service。
- 根据 Web Vitals 评级自动扩容、回滚或执行修复。SQS 工作量驱动的 processor
  0→1→0 容量管理属于消费链路自身，不属于业务性能自动修复。

## 验收标准

- [ ] AC-001：共享 schema、SDK 脱敏/批量、入口、processor 清洗和统计测试通过。
- [ ] AC-002：`pnpm test`、`pnpm check-types`、`pnpm build` 通过。
- [ ] AC-003：基础设施模板通过静态边界检查和 SAM/CloudFormation 校验。
- [ ] AC-004：浏览器产生的五项 Web Vitals 经 API、SQS、ECS 后写入 CloudWatch
  和 PostgreSQL。
- [ ] AC-005：`/performance` 可显示五项 p75、趋势、样本量和 route 对比。
- [ ] AC-006：带 query、token、超长字段或非法负值的测试事件不会把敏感值写入
  CloudWatch、数据库或 API 响应。
- [ ] AC-007：processor 停止时主队列积压并触发年龄告警；恢复后继续消费。
- [ ] AC-008：重复投递同一 `eventId` 不产生重复数据库记录。
- [ ] AC-009：首次打开和 SPA path 切换均产生独立 `page-view`；SQS 积压可把
  processor 从 0 拉到 1，排空后自动恢复 0。
