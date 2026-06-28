---
description: 安全规范 - 密钥/环境变量管理、输入校验、认证授权、CORS 与数据访问的强制约定
globs: ["apps/server/**", "packages/api/**", "packages/db/**", "packages/env/**"]
---

# 安全规范

适用于 github-account-info monorepo（Hono + tRPC server、Drizzle ORM + PostgreSQL、TanStack Router web）。所有服务端与数据访问代码必须遵守以下规则。

## 密钥与环境变量

- 严禁在源码、日志、提交信息或前端代码中硬编码任何密钥、令牌、数据库连接串或第三方凭证。
- 所有环境变量必须经 `@github-account-info/env` 的 `createEnv`（`@t3-oss/env-core`）声明并用 zod 校验后再使用，禁止在业务代码中直接读取 `process.env`。
- 区分 server 与 web 两份 env schema：仅 `packages/env/src/server.ts` 可声明敏感变量（如 `DATABASE_URL`）；`web.ts` 只允许暴露给浏览器的公开变量，禁止把服务端密钥放入 web env。
- `.env` 文件（`apps/server/.env`、`apps/web/.env`）禁止提交到仓库，确认已被 `.gitignore` 覆盖；新增变量时同步更新 `.env.example`（如有）与对应 env schema。
- 生产环境禁止设置 `SKIP_ENV_VALIDATION`，确保 env 校验始终执行。

## 输入校验

- 所有 tRPC procedure 的 `input` 必须用 zod schema 显式定义并校验，禁止信任未校验的客户端数据。
- 对外部输入（query 参数、请求体、第三方 API 响应）一律先校验再使用；校验失败应返回明确错误而非静默放行。
- 校验逻辑应贴近 procedure/边界层，不在深层业务逻辑里临时补救。

## 认证与授权

- 认证与会话信息只能来自 `packages/api/src/context.ts` 的 `createContext`（`ctx.auth` / `ctx.session`），禁止在 procedure 内自行解析凭证。
- 需要登录的 procedure 必须使用受保护的 tRPC middleware/`protectedProcedure`，在执行业务前校验 `ctx.session`；缺失会话时抛出 `UNAUTHORIZED`。
- 授权检查（资源归属、角色权限）必须在服务端完成，禁止仅依赖前端隐藏 UI 来限制访问。
- 切勿在错误信息、tRPC 响应或日志中回传敏感会话内容、密码哈希或令牌。

## CORS 与传输

- CORS 来源必须来自校验后的 `env.CORS_ORIGIN`，禁止使用 `*` 通配或硬编码域名；`allowMethods` 仅开放实际需要的方法。
- 生产环境必须经由 HTTPS 暴露服务，敏感 cookie 须设置 `HttpOnly` / `Secure` / `SameSite`。

## 数据访问（Drizzle + PostgreSQL）

- 所有查询通过 Drizzle ORM 的参数化查询构建，禁止用字符串拼接 SQL；使用 `sql` 原始片段时必须用占位符绑定参数，杜绝 SQL 注入。
- 查询只 select 必要字段，避免无意中返回密码哈希、令牌等敏感列。
- migration 与 schema 变更经 `pnpm db:generate` / `pnpm db:migrate` 管理，禁止在生产库手工执行未经评审的 DDL。

## 日志与依赖

- 使用 `hono/logger` 等日志时禁止记录密钥、令牌、完整请求体中的敏感字段；按需脱敏。
- 依赖通过 pnpm catalog 统一管理；新增依赖前评估来源与安全性，定期处理 `pnpm audit` 报告的高危漏洞。
- 提交前运行 `pnpm check`（Biome）与 `pnpm check-types` 确保无引入明显问题。
