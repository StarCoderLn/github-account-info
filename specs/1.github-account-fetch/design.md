# GitHub 账户信息拉取接口 — 技术设计

## 设计版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-27 | v1   | 初始设计 |

## 项目架构

- 架构类型: pnpm + Turborepo monorepo
- 涉及层:
  - **服务层**: `packages/api/src/services/github.ts`（GitHub API 客户端）
  - **接口层**: `packages/api/src/routers/github.ts`（tRPC 路由），挂载到 `packages/api/src/routers/index.ts` 的 `appRouter`
  - **运行时**: `apps/server`（Hono 已通过 `@hono/trpc-server` 挂载 `appRouter`，本 feature 无需改动 server 入口）

## 功能模块设计

### 模块 1: GitHub API 客户端服务

`packages/api/src/services/github.ts`

- 导出 `fetchGithubAccount(token: string): Promise<GithubAccount>`。
- 使用全局 `fetch` 调用 `GET https://api.github.com/user`，请求头：
  - `Authorization: Bearer ${token}`
  - `Accept: application/vnd.github+json`
  - `User-Agent: github-account-info`（GitHub 强制要求，缺失会 403）
  - `X-GitHub-Api-Version: 2022-11-28`
- 使用 `AbortSignal.timeout(10_000)` 设置超时。
- 根据 `res.status` 抛出语义化错误（由路由层捕获并转 `TRPCError`）：
  - 401 → 抛 `GithubAuthError`
  - 403 → 检查 `x-ratelimit-remaining`，抛 `GithubRateLimitError` 或权限错误
  - 其它非 2xx → 抛 `GithubApiError`
- 成功后调用归一化函数返回 `GithubAccount`。

**涉及层及关键设计:**

- 归一化映射（GitHub 字段 → 核心字段）：
  | 核心字段     | GitHub 响应字段 |
  | ------------ | --------------- |
  | login        | login           |
  | githubId     | id              |
  | name         | name            |
  | avatarUrl    | avatar_url      |
  | bio          | bio             |
  | company      | company         |
  | location     | location        |
  | email        | email           |
  | publicRepos  | public_repos    |
  | followers    | followers       |
  | following    | following       |

### 模块 2: tRPC 路由

`packages/api/src/routers/github.ts`

- `githubRouter = router({ getAccount: publicProcedure.input(z.object({ token: z.string().trim().min(1) })).mutation(...) })`
- **用 `mutation` 而非 `query`**：httpBatchLink 的 query 会把 input 拼进 URL，token 是敏感信息，必须走 POST body。
- handler 内 `try/catch` 调 `fetchGithubAccount`，把服务层错误映射为 `TRPCError`：
  - `GithubAuthError` → `UNAUTHORIZED`
  - `GithubRateLimitError` → `TOO_MANY_REQUESTS`
  - 其它 → `INTERNAL_SERVER_ERROR`
- 在 `routers/index.ts` 用 `github: githubRouter` 合并进 `appRouter`。

## 接口契约

```ts
// 输入
{ token: string }              // 非空，trim
// 输出 GithubAccount
{
  login: string;
  githubId: number;
  name: string | null;
  avatarUrl: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  email: string | null;
  publicRepos: number;
  followers: number;
  following: number;
}
```

调用方式（前端）：`trpc.github.getAccount.mutate({ token })`。

## 数据模型

本 feature **不涉及数据库**（token 不落库，账户信息实时拉取）。`GithubAccount` 输出类型与 feature 2 的 `github_account` 表字段保持一致，便于 feature 3 拉取后直接落库。

## 安全考虑

- token 仅存在于请求 body 与服务层函数入参，**禁止写日志、禁止拼 URL、禁止返回**。
- Hono `logger()` 中间件只记录路径/方法，不记录 body，符合要求。
- 超时与错误兜底，避免外部依赖拖垮服务。

## 技术决策

| 决策             | 选项                       | 理由                                         |
| ---------------- | -------------------------- | -------------------------------------------- |
| query vs mutation| **mutation**               | 避免 token 进入 URL/批处理缓存，安全          |
| HTTP 客户端      | **原生 fetch**             | Node 18+ / 运行时已内置，无需新增依赖          |
| 归一化位置       | **服务层**                 | 路由层只做错误映射，职责单一，字段对齐 DB 表   |
