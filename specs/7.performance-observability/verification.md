# Feature 7 云端验证记录

更新时间：2026-07-27（Asia/Shanghai）

## 最终状态

- PR #22、#23、#24、#25 已合并到 `master`；AWS 运行时验收提交为
  `3f0efe1a177dbfff467c326dedf6b8de6118323f`。
- `github-account-info-performance-deployer-policy`：
  `UPDATE_COMPLETE`。
- `github-account-info-performance`：
  `UPDATE_COMPLETE`。
- ECS Service `github-account-info-performance`：
  `ACTIVE`，`desired=0`、`running=0`、`pending=0`，rollout
  `COMPLETED`。
- 当前 Task Definition：
  `github-account-info-performance:2`。
- 当前不可变镜像：
  `prod-3f0efe1a177dbfff467c326dedf6b8de6118323f`，
  digest `sha256:44ed86fab680c7b2c0d97ea16005377a1a9e3e69e2b8b5e204b03b5d1ebe05b3`。
- Performance 主队列可见、处理中和延迟消息均为 `0`；DLQ 消息为 `0`。
- Node Lambda `live` alias 已接入 Performance Queue；此前发布 run
  `30252625642` 成功，alias version 为 `7`，无附加 canary weight。
- Cloudflare Pages production 已运行页面改版合并提交
  `92cd3db3dd889aed793b84c9d38564533624572a`。生产变量为
  `VITE_PERFORMANCE_ENABLED=true`、`VITE_APP_ENVIRONMENT=production`、
  `VITE_APP_RELEASE=92cd3db`，deployment
  `b0c24ded-c8a5-43a3-a69b-fd536a6dac46` 构建成功。

闲置状态保持 `DesiredCount=0`，因此没有常驻 Fargate task 费用。Queue、ECR、
CloudWatch Logs 和 alarms 等按各自用量或保留量计费。

## 已验收基线

2026-07-27 线上访问未增加统计时完成只读诊断：

- ECS Service 仍为 `ACTIVE`、`desired=0`、`running=0`、`pending=0`。
- 主队列可见、处理中、延迟消息均为 `0`。
- production bundle 包含启用的 SDK、动态 SDK chunk 和正确接收路径。
- 根因边界包括两项：旧版只在 monitor `start()` 时记录首次加载，不记录
  TanStack Router SPA path 切换；processor 为 0 时即使消息入队也不会自动清洗。

当时分支已完成并作为低成本自动伸缩方案保留：

1. Web 入口记录初始 URL，并在 Router `onResolved` 后记录真实 path 切换。
2. SDK 支持显式 route 的 `trackPageView(route)`，删除 query/fragment；延迟加载
   期间最多暂存 100 条 route。
3. Performance stack 增加 `MinCapacity=0`、`MaxCapacity=1` 的 ECS scalable
   target、SQS scale-out/scale-in policy，以及同时观察 visible/in-flight 的
   排空告警。
4. SDK 专项测试、SDK/Web 类型检查、Web production build、全套 infra boundary
   和两份 CloudFormation `validate-template` 均通过。

以上是 2026-07-27 的历史验收基线，不代表当前准实时改动已经部署。

## 准实时改动（待部署）

2026-07-28 根据“十几秒内看到统计”的体验目标完成代码调整：

1. `/performance` 在标签页可见时每 10 秒后台回读，刷新和筛选期间保留旧数据，
   不进入整页 loading。
2. runtime Change Set 默认 `DesiredCount=1`；scalable target 的 `MinCapacity`
   引用同一参数，使 processor 保持常驻。
3. 首次 CREATE 必须使用 0 的安全门仍然保留，避免 ECR 尚无镜像时启动 Service。
4. 传回 `DesiredCount=0` 时仍可恢复原来的 queue-driven 0→1→0 低成本模式。

这些记录只代表本地实现与部署准备；T-709 在代码合并到 `master`、reviewed Change
Set 执行以及真实浏览器链路验收完成前保持未完成。

## 本地手动验收

### 页面与交互

本地服务由开发者手动启动：

```bash
pnpm dev
```

打开 `http://localhost:3001/performance` 后检查：

1. 五项 Web Vitals 卡片均展示，LCP、INP、CLS、FCP、TTFB 数值与评级对应。
2. 趋势指标可从 LCP 切换到 TTFB；单时间桶显示基线和说明，不伪造连续趋势。
3. 路由对比表紧贴卡片内容区，不再出现默认上下空带。
4. 慢请求和错误分布按实际内容自适应高度；空状态或单条数据不再撑满整行。
5. 时间范围、环境、版本和路由筛选切换后会在后台重新查询；当前统计保持可见，
   页面不白屏、不回到整页 loading，筛选栏短暂显示“正在更新…”。
6. 后台刷新失败时保留上一份统计并显示失败提示；刷新按钮仍可重试。

### SDK 事件发送

要在本地观察 SDK 请求，`apps/web/.env` 只需显式打开采集开关：

```env
VITE_PERFORMANCE_ENABLED=true
```

`VITE_APP_ENVIRONMENT` 和 `VITE_APP_RELEASE` 只用于给事件添加环境、版本标签；
本地默认值已经是 `development` 和 `local`，因此不配置时行为相同。

同时确保 `VITE_SERVER_URL` 指向可用的 Node API。打开浏览器开发者工具的 Network，
筛选 `/api/v1/performance/events`，依次在 `/`、`/ops`、`/performance` 之间做
SPA 跳转并等待 5 秒；请求应返回 `202`，payload 中的 `page-view.route` 应分别是
真实 path，且不包含 query 或 fragment。

`202` 只证明浏览器到 SQS 的接收链路成功。当前自动扩缩容 Change Set 尚未部署，
线上 ECS processor 仍为 `DesiredCount=0`；在 reviewed Change Set 完成前，不能把
页面访问后数据库统计未立即变化误判为 SDK 失效。

## 数据库迁移

一次性迁移 workflow run `30254570385` 成功：

- ECS task：
  `arn:aws:ecs:us-east-2:879980498268:task/github-account-info-go/077a94c27ee546bdb66da7331c7de4ed`
- Task Definition：`github-account-info-performance:2`
- override：`PERFORMANCE_PROCESSOR_MODE=migrate`
- 最终状态：`STOPPED`
- 容器退出码：`0`
- CloudWatch 日志：
  `performance database migrations completed`

`0004_cheerful_lightspeed.sql` 只创建独立 `performance_event` 表和 3 个索引，
没有 `ALTER`、`DROP`、重命名或原业务表数据回填。迁移后只读冒烟验证确认：

- `/` Token 管理成功读取原有 `StarCoderLn` 账号及统计数据。
- `/ops` 成功读取原有 AI Ops 调查列表、证据和结论。

## 真实链路验收

短时把 ECS processor 切到 `DesiredCount=1` 后：

1. `POST /api/v1/performance/events` 返回 `202 {"accepted":7}`。
2. 批次包含 LCP、INP、CLS、FCP、TTFB、page-view 和受控 error。
3. SQS 消息被消费，processor 日志记录：
   `received=7`、`inserted=7`、`duplicates=0`。
4. 日志中的 7 条事件均完成 schema 校验、route 归一化和字段清洗。
5. `/performance` 从 PostgreSQL 真实回读并显示：
   - LCP p75：`1.80 s`
   - INP p75：`120 ms`
   - CLS p75：`0.050`
   - FCP p75：`900 ms`
   - TTFB p75：`240 ms`
   - 前端错误：`1`
   - 页面访问：`1`
   - 事件处理延迟 p75：`37.84 s`
6. route 表 `/performance` 同时展示五项 p75。
7. 生产域名的 CORS OPTIONS 返回 `204`，带生产 Origin 的 POST 返回 `202`
   和正确的 `access-control-allow-origin`。
8. 生产 JS 已确认包含启用后的 SDK 配置、当前 release、接收路径和可下载的动态
   SDK chunk。
9. 页面视觉改版合并后，Cloudflare production 自动部署提交 `92cd3db`；随后更新
   `VITE_APP_RELEASE=92cd3db` 并重试同一提交，部署在 34 秒内成功。
10. 生产 `/performance` 已实际显示新版 Hero、独立筛选栏、五项指标卡片、健康
    概览、单样本趋势说明、route 表和错误分布；趋势选择从 LCP 切换到 TTFB 正常。
11. 公开生产 bundle 已核对包含 `VITE_APP_RELEASE:"92cd3db"` 和
    `VITE_PERFORMANCE_ENABLED:"true"`。

浏览器 SDK 源码位置：

- `packages/performance-sdk/src/monitor.ts`
- `packages/performance-sdk/src/sanitize.ts`
- `packages/performance-sdk/src/index.ts`
- `apps/web/src/utils/performance-monitor.ts`
- `apps/web/src/main.tsx`

Chrome 自动化的后台标签页没有产生可稳定观察的定时 flush；其控制扩展日志存在
后台消息通道告警。因此云端验收使用相同生产 Origin 的真实 HTTP 批次验证接收链路，
并以生产构建产物核对 SDK 开关和动态 chunk。真实前台访问继续由 SDK 正常采样。

## GitHub Actions 证据

| Run | 操作 | 结果 |
| --- | --- | --- |
| `30253932166` | 创建 migration 所需 deployer policy Change Set | Success |
| `30254031079` | 执行 deployer policy Change Set | Success |
| `30254128815` | 测试、构建并推送最终 processor 镜像 | Success |
| `30254256047` | 创建新镜像、DesiredCount=0 runtime Change Set | Success |
| `30254367512` | 执行零副本 runtime 更新 | Success |
| `30254570385` | 运行一次性 ECS 数据库迁移 | Success |
| `30254805191` | 创建短时 DesiredCount=1 验收 Change Set | Success |
| `30254900836` | 执行短时 processor 启动 | Success |
| `30255319642` | 创建首次验收归零 Change Set | Success |
| `30255424267` | 执行首次验收归零 | Success |
| `30255532100` | 创建 CORS 探针排空启动 Change Set | Success |
| `30255622992` | 执行 CORS 探针排空启动 | Success |
| `30255701243` | 创建最终 DesiredCount=0 Change Set | Success |
| `30255789790` | 执行最终归零 | Success |

所有 AWS 写操作均由 `github-actions-deployer` 的 GitHub OIDC 短期凭证完成。本机
AWS root 凭证只用于 `describe-*` / `get-*` / `list-*` 只读核对。

## 保留项

- 未做真实暂时性数据库故障和 DLQ redrive 演练。该演练会影响共享 RDS 或故意制造
  重试积压，不属于本次低风险验收范围。
- 2026-07-27 的线上基线仍是 `DesiredCount=0`。准实时改动必须合并到 `master`
  后再通过 reviewed Change Set 切到 1；在云端验收完成前不能把本地模板状态写成
  已上线。
