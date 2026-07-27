# Feature 7：性能 SDK 与可视化统计任务

## 规格与契约

- [x] T-001：确认公开路径使用 `/api/v1/performance/events`。
- [x] T-002：确认页面展示 LCP、INP、CLS、FCP、TTFB 五项指标。
- [x] T-003：完成 requirements、design 和任务清单。
- [x] T-101：创建 `@github-account-info/performance-schema` 和正反例测试。

## 浏览器 SDK

- [x] T-201：创建 `@github-account-info/performance-sdk` package。
- [x] T-202：实现五项 Web Vitals、页面加载、资源请求、错误和自定义事件采集。
- [x] T-203：实现批量、定时、visibility/sendBeacon、fetch fallback 和队列上限。
- [x] T-204：实现 URL 清理、字段限制、采样和幂等 start/stop。
- [x] T-205：在 web 生产入口延迟初始化 SDK。

## 接收入口和队列

- [x] T-301：扩展 server env 和 performance SQS publisher。
- [x] T-302：实现 Hono `POST /api/v1/performance/events` 和 body limit。
- [x] T-303：更新 server SAM route、参数、环境变量和最小 SendMessage policy。
- [x] T-304：创建主队列、DLQ、queue age 和 DLQ alarm。

## ECS processor 与数据库

- [x] T-401：创建独立 `apps/performance-processor`、构建脚本和容器。
- [x] T-402：实现长轮询、清洗、脱敏、错误分类和批量删除。
- [x] T-403：创建 `performance_event` schema、迁移和索引。
- [x] T-404：实现 event ID 幂等批量入库和 7 天清理命令。
- [x] T-405：创建 ECR、TaskDefinition、Task Role、Service 和 Log Group IaC。

## 统计 API 和页面

- [x] T-501：实现五项指标真实 p50/p75/p95、趋势和 route 统计查询。
- [x] T-502：新增 `performance.overview` router 并接入 AppRouter。
- [x] T-503：新增 `/performance` 页面和导航入口。
- [x] T-504：完成五项首屏卡片、趋势、route 表、慢请求和错误分布。
- [x] T-505：完成加载、错误、空状态、筛选和手工刷新。

## 验证和文档

- [x] T-601：运行 schema、SDK、入口、processor、API 单元测试。
- [x] T-602：运行全仓 `test/check-types/build`。
- [x] T-603：运行基础设施静态检查和模板校验。
- [x] T-604：更新 README、infra README、RUNBOOK 和 processor README。
- [x] T-605：把可复用踩坑追加到 AGENTS.md。

## 云端验收（部署后）

- [ ] T-701：部署 performance stack 并推送不可变 processor image。
- [ ] T-702：把 queue 输出接入 server stack 并审查 Change Set。
- [ ] T-703：设置 web production SDK endpoint、release 和采样率。
- [ ] T-704：验证五项指标完整经过 API、SQS、ECS、CloudWatch 和 PostgreSQL。
- [ ] T-705：执行敏感字段、重复 event ID、processor 停止和 DLQ 演练。
