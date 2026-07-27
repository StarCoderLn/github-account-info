# Feature 7：性能 SDK 与可视化统计技术设计

## 设计结论

第一版采用异步、凭证隔离的浏览器 RUM 链路：

```text
Browser performance SDK
  └─ POST /api/v1/performance/events
       └─ API Gateway -> Node/Hono Lambda
            └─ SQS -> ECS performance processor
                       ├─ stdout JSON -> CloudWatch Logs
                       └─ cleaned rows -> PostgreSQL
                                            └─ tRPC -> /performance
```

Lambda 是薄入口，ECS 是唯一清洗边界，PostgreSQL 是第一版统计数据源。
CloudWatch Logs 保存清洗过程和清洗事件，不作为页面每次加载时的在线查询数据源。

## 仓库结构

```text
packages/performance-schema/  # 网络、队列、存储共享契约
packages/performance-sdk/     # 浏览器采集、缓冲和传输
apps/performance-processor/   # SQS 长轮询、清洗、批量入库
apps/server/src/routes/       # Hono performance 接收入口
packages/db/src/schema/       # performance_event 表
packages/api/src/routers/     # performance 统计 API
apps/web/src/routes/          # /performance 页面
infra/performance.yaml        # Queue/DLQ/ECR/ECS/LogGroup/Alarm
```

共享 package 只包含纯 schema 或浏览器 SDK，不包含 AWS client、数据库连接和部署
配置。所有 AWS 副作用保留在可部署 app/service 中。

### 代码导读

按一次页面访问从产生到展示的顺序阅读：

1. `packages/performance-schema/src/index.ts`：定义事件、批次、清洗结果和统计筛选
   的共享契约；CLS 使用无单位 `score`，其他 Web Vitals 使用 `ms`。
2. `packages/performance-sdk/src/monitor.ts`：浏览器 Performance SDK（RUM）的采样、
   Web Vitals observer、访问/错误/请求采集、内存队列、批量发送和一次重试。
3. `apps/web/src/utils/performance-monitor.ts` 与 `apps/web/src/main.tsx`：按环境开关
   延迟加载 SDK，并把 TanStack Router 的真实 SPA path change 转成 page-view。
4. `apps/server/src/routes/performance.ts` 与
   `packages/api/src/services/performance-ingest.ts`：限制匿名请求体、校验协议并将
   批次写入 SQS；HTTP 202 只表示成功入队。
5. `apps/performance-processor/src/clean.ts`、`processor.ts`、`repository.ts`：ECS
   consumer 二次校验、脱敏、规范化、区分永久/暂时错误，并以 event ID 幂等入库。
6. `packages/db/src/schema/performance-event.ts`：原始清洗样本表和三组统计索引。
7. `packages/api/src/services/performance-stats.ts`：直接用 PostgreSQL 原始样本计算
   p50/p75/p95、访问量、错误、趋势、路由对比和处理延迟。
8. `apps/web/src/routes/performance.tsx`：展示五项 Web Vitals 和辅助统计；筛选改变
   时保留上一份成功数据并后台更新，避免整页白屏。

## 事件协议

每个事件包含：

```json
{
  "schemaVersion": 1,
  "eventId": "UUID",
  "occurredAt": "ISO-8601",
  "appId": "github-account-info-web",
  "environment": "production",
  "release": "prod-<git-sha>",
  "sessionId": "anonymous UUID",
  "route": "/u/:username",
  "type": "web-vital",
  "name": "LCP",
  "value": 1820,
  "unit": "ms"
}
```

Web Vital 单位：

- LCP、INP、FCP、TTFB：`ms`
- CLS：`score`

批次 envelope 只包含 `schemaVersion` 和 `events`，不携带凭证、用户信息或任意
metadata map。禁止任意 map 可以降低意外收集敏感信息和高基数字段的风险。

## SDK 生命周期

`createPerformanceMonitor()` 返回 `start/stop/flush/track/trackPageView`。`start`
幂等，五个 `web-vitals` observer 只注册一次。SDK 使用动态 import 延后加载
`web-vitals`，避免阻塞首屏。

Web 入口在调用 SDK 时关闭 monitor 内部的自动首访计数，先捕获当前完整 URL，再由
入口显式记录一次初始 `page-view`。TanStack Router 的 `onResolved` 只在
`fromLocation` 存在且 `pathChanged=true` 时记录后续访问，因此首次解析不会重复，
query/hash 变化也不会虚增访问量。SDK 动态 chunk 就绪前到达的 route 使用最多
100 条的内存队列暂存；route 在入队时立即删除 query/fragment 并归一化。

队列满足任一条件时 flush：

- 累计 20 条；
- 距上次发送 5 秒；
- `document.visibilityState === "hidden"`；
- 调用方显式调用 `flush()`。

flush 先交换内存队列，再发送副本，避免发送期间新事件丢失。失败批次只回填一次，
并受 100 条上限保护。performance endpoint 自身不参与资源请求采集。

## 接收入口

Hono 路由固定为 `POST /api/v1/performance/events`：

1. `bodyLimit` 在读取前限制 64 KiB。
2. JSON parse 失败返回 400。
3. 共享 batch schema 失败返回稳定的 `INVALID_PERFORMANCE_BATCH`。
4. 未配置 queue 返回 503，不伪造成功。
5. 成功通过 `SendMessage` 将整个 batch 写入单条 SQS 消息并返回 202。

API 不返回事件内容，避免反射敏感输入。API Gateway 对该 route 使用现有 Lambda
`live` alias，继续受 Lambda 灰度权重控制。

## ECS 清洗边界

processor 使用 20 秒 SQS 长轮询，每次最多读取 10 条 batch 消息：

1. JSON parse 和共享 schema 校验。
2. 时间戳不得早于 7 天或晚于服务器时间 5 分钟。
3. route 删除 query/fragment 并归一化动态 path segment。
4. 文本字段执行凭证模式替换和长度限制。
5. `processingLagMs = receivedAt - occurredAt`。
6. 使用 `event_id` 主键和 `ON CONFLICT DO NOTHING` 幂等批量写库。
7. 每条清洗事件写一行 JSON stdout。
8. 整批成功后删除 SQS message。

非法契约属于永久错误，记录批次拒绝日志后删除消息；数据库连接、SQS API 和未知
运行时错误属于暂时错误，不删除消息，由 visibility timeout 和 DLQ 处理。

## ECS 按队列自动伸缩

processor 仍是独立 ECS Service，但 Application Auto Scaling 将容量限制为
`MinCapacity=0`、`MaxCapacity=1`：

1. `ApproximateNumberOfMessagesVisible >= 1` 持续一个 60 秒数据点时执行
   `ChangeInCapacity +1`。
2. 可见消息与 `ApproximateNumberOfMessagesNotVisible` 之和小于 1，且连续三个
   60 秒数据点成立时执行 `ChangeInCapacity -1`。
3. scale-in 使用 180 秒 cooldown，消息仍在 visibility timeout 或数据库处理中
   时不会把 task 提前停掉。

CloudWatch SQS 指标和 Fargate 冷启动决定这不是秒级实时链路；目标是在低流量时
避免常驻费用，同时无需人工切换 DesiredCount。扩缩容策略只管理该 Service 的
`ecs:service:DesiredCount`，最多启动一个 processor，不依据 Web Vitals 好坏扩容
业务服务。

## PostgreSQL

`performance_event` 使用 UUID `event_id` 主键。`occurred_at`、`received_at` 使用
带时区 timestamp；metric value 使用 double precision；可选诊断字段使用受限
JSONB。

页面统计直接对清洗后的样本使用 PostgreSQL `percentile_cont` 计算 p50/p75/p95。
第一版数据量低，保留原始清洗样本可以保证百分位数准确，也便于验证 SDK。processor
启动后及每 24 小时删除早于 7 天边界的数据；清理失败只记录稳定错误并在一小时后
重试，不阻塞队列消费。数据量增长后再迁移到 S3 归档和小时 histogram，不提前
引入复杂基础设施。

## 统计 API

新增 procedure：

```text
performance.overview
```

输入：

```text
range: 1h | 24h | 7d
environment?: string
release?: string
route?: string
```

输出：

- 五项 metric 的 p50/p75/p95/count/rating；
- page view 总量、匿名 session 数；
- error count/error rate；
- p75 processing lag；
- 五项时间趋势；
- 按 route 的五项 p75；
- 慢请求和错误分组。

查询使用参数化 SQL，所有筛选值来自 Zod 限长 enum/string，不拼接任意 SQL。

## 页面

`/performance` 使用监控仪表盘布局：顶部 Hero 显示链路状态、数据保留周期和
健康指标数量，筛选工具栏独立成区。核心区域固定显示五项 Web Vitals 卡片：

```text
LCP | INP | CLS | FCP | TTFB
```

第二行显示错误率、页面访问量、处理延迟。趋势图与五项健康概览并排，下面依次为
route 对比表、慢请求和错误分布。卡片使用统一图标、层级、留白和响应式单列断点；
趋势只有一个时间桶时将点居中并明确提示样本不足，避免单点被画成有方向性的趋势。

页面使用 React Query 单查询一次取得 dashboard 数据，避免多个卡片分别请求造成
waterfall。只在用户主动刷新或筛选变化时重新查询。

## IAM 与安全

浏览器没有 AWS 凭证。Node Role 只允许 `sqs:SendMessage` 到 performance queue。
processor Task Role 只允许该 queue 的 Receive/Delete/GetAttributes。数据库 Secret
通过 ECS `Secrets` 注入，不出现在模板输出或日志。

CloudWatch 日志不得记录请求 body、数据库 URL、Authorization、Cookie、IP 或
User-Agent。拒绝日志只记录稳定错误码、SQS message ID 和计数。

## 部署与状态

Feature 7 状态分为：

1. 代码侧闭环；
2. 部署准备完成；
3. AWS stack 和 processor image 已部署；
4. 真实浏览器链路验收完成。

本地测试、构建和模板校验通过只代表前两层，不得写成云端已完成。
