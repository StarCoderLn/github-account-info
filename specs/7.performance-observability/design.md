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

`/performance` 第一行固定显示五项 Web Vitals 卡片：

```text
LCP | INP | CLS | FCP | TTFB
```

第二行显示错误率、页面访问量、处理延迟。下面依次为五项趋势图、route 对比表、
慢请求和错误分布。页面使用 React Query 单查询一次取得 dashboard 数据，避免
多个卡片分别请求造成 waterfall。只在用户主动刷新或筛选变化时重新查询。

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
