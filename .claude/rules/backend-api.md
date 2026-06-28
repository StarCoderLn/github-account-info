---
description: 后端 API 规范——tRPC procedure 定义、router 组织、context/认证与端到端类型安全约定
globs: ["apps/server/**", "packages/api/**"]
---

# 后端 API 规范

适用于 github-account-info monorepo 的服务端 API 层：业务 API 以 tRPC procedure 形式定义在 `packages/api`，由 `apps/server`（Hono）装配并启动。技术栈 Hono + tRPC + TypeScript。

## 分层职责

- `packages/api`：API 唯一来源。`src/index.ts` 初始化 tRPC（`initTRPC.context<Context>().create()`），导出 `router`、`publicProcedure`；`src/routers/` 定义业务 procedure 并汇总到 `appRouter`，导出 `AppRouter` 类型供前端推导。
- `apps/server`：仅负责装配与运行——挂载 `@hono/trpc-server` 到 `/trpc/*`、配置 CORS、健康检查与 `serve`。不在此层写业务逻辑。
- 前端通过 tRPC client 调用，类型从 `@github-account-info/api` 的 `AppRouter` 推导，禁止手写接口类型。

## Procedure 约定

- 读操作用 `.query()`，写操作用 `.mutation()`；按语义选择，不要用 query 执行有副作用的写入。
- 所有带输入的 procedure 必须用 `.input(zodSchema)` 显式定义并校验输入（zod 走 pnpm catalog 版本），禁止信任未校验的客户端数据。
- 输出尽量让 tRPC 自动推导；需要约束时用 `.output()`，避免无意返回敏感字段。
- 新增 procedure 在 `src/routers/` 内组织，挂载到 `appRouter`；按领域拆分子 router（`router({ ... })` 嵌套）保持单个文件聚焦。
- procedure 内不直接拼 SQL，数据库访问统一通过 `@github-account-info/db`（Drizzle）。
- 环境变量统一走 `@github-account-info/env`，禁止散落 `process.env`。

## Context 与认证

- 认证与会话信息只能来自 `packages/api/src/context.ts` 的 `createContext`（`ctx.auth` / `ctx.session`），禁止在 procedure 内自行解析凭证。
- 当前 `createContext` 返回 `{ auth: null, session: null }`，认证尚未接入；接入后需要登录的 procedure 必须经受保护的 middleware（`protectedProcedure`）校验 `ctx.session`，缺失会话抛 `UNAUTHORIZED`，再执行业务。
- 授权（资源归属、角色）必须在服务端完成，不依赖前端隐藏 UI。
- 错误信息、tRPC 响应与日志中不得回传敏感会话内容、令牌或密码哈希。

## 装配（apps/server）

- tRPC 经 `trpcServer({ router: appRouter, createContext })` 挂载到 `/trpc/*`，新增 router 通过 `appRouter` 汇总，不在 server 层另开路由树。
- CORS `origin` 必须来自校验后的 `env.CORS_ORIGIN`，`allowMethods` 仅开放实际需要的方法，禁止 `*` 通配或硬编码域名。
- 日志使用 `hono/logger`，禁止记录密钥、令牌或敏感请求体字段。

## 错误处理

- 校验失败或业务错误用 tRPC 的错误机制（`TRPCError` + 标准 code）抛出，返回明确 code，禁止静默放行或裸抛字符串。
- 错误信息面向调用方应可读且不泄露内部实现细节与敏感数据。

## 开发与校验

- 开发命令：`pnpm dev:server`（= `turbo -F server dev`）。
- 提交前必须通过类型检查 `pnpm run check-types` 与 Biome 检查 `pnpm run check`。
- 端到端类型安全是底线：不得用 `any` / `@ts-ignore` 绕过 tRPC 与 zod 推导；确需豁免须就近注释原因。
