# 后端规范 (apps/server + packages/api)

技术栈:Hono + tRPC + TypeScript。

- 业务 API 以 tRPC procedure 形式定义在 `packages/api`,`apps/server` 仅负责装配/启动。
- 输入输出用 zod 校验(catalog 版本),保证端到端类型安全。
- 数据库访问通过 `@github-account-info/db`(Drizzle),不在 procedure 内直接拼 SQL。
- 环境变量统一走 `@github-account-info/env`,禁止散落 `process.env`。
- 开发命令 `pnpm dev:server`;提交前跑 `pnpm check` 与 `pnpm check-types`。
