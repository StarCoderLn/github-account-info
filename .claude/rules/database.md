---
description: 数据库与 Drizzle ORM 规范 (packages/db)
globs: packages/db/**
---

# 数据库规范 (packages/db)

技术栈:Drizzle ORM + PostgreSQL(Neon serverless),schema 目录为 `packages/db/src/schema`。

- schema 定义放在 `packages/db/src/schema/*.ts`,并从 `schema/index.ts` 统一导出;`drizzle.config.ts` 的 `schema` 指向该目录。
- 数据库连接统一通过 `@github-account-info/db` 的 `db` / `createDb()`(`drizzle-orm/neon-http` + `neon()`),业务代码不另外创建连接。
- `DATABASE_URL` 等敏感配置统一走 `@github-account-info/env`,禁止散落 `process.env`;迁移工具读取 `apps/server/.env`。
- 改动 schema 后用 `pnpm --filter @github-account-info/db db:generate` 生成迁移,迁移文件落在 `src/migrations`,纳入版本控制;不要手改已生成的迁移。
- 生产/共享环境用 `db:generate` + `db:migrate`,`db:push` 仅用于本地快速迭代,`db:studio` 用于可视化调试。
- 查询尽量复用 Drizzle query builder 与类型推导,避免裸 SQL;有索引/性能考量时在 PR 说明。

## 命名约定

- 表名使用 snake_case 复数形式(如 `github_accounts`、`user_sessions`)。
- 列名使用 snake_case;主键统一命名 `id`(类型 `uuid` 或 `serial`),创建时间 `created_at`、更新时间 `updated_at`。
- Drizzle 表变量名使用 camelCase 单数(如 `githubAccount`),导出类型推导名(如 `type GithubAccount = typeof githubAccount.$inferSelect`)从 `schema/index.ts` 统一导出。
- 关系定义（`relations()`）紧跟对应表定义放在同一文件中。

## 类型安全

- 使用 `$inferSelect` / `$inferInsert` 推导行类型,禁止手写与表结构重复的 interface。
- `createDb()` 返回带完整 schema 类型的 Drizzle 实例,调用方通过 `@github-account-info/db` 导入,不要手动传入不完整的 schema 对象。
- 涉及可空列时 Drizzle 会推导 `T | null`,业务代码中显式收窄,不要用 `!` 强断言。

## 索引与性能

- 高频查询的过滤列（外键、状态字段、时间戳）在 schema 中通过 `.index()` 或 `.unique()` 声明索引,不要依赖事后手工 DDL。
- 避免在循环中逐条执行查询(N+1),优先用 `db.query.*` 的 `with` 关系加载或一次性 `inArray` 批量查询。
- 分页查询使用 `limit` + `offset` 或基于游标(keyset pagination)的方式,结果集较大时避免全表扫描。

## 安全

- 所有查询参数通过 Drizzle 的参数化绑定传入,禁止用字符串拼接构造查询条件。
- 使用 `sql` 原始片段时必须用 `sql.placeholder()` / 占位符绑定参数,杜绝 SQL 注入。
- 只 select 必要字段,避免无意中将密码哈希、令牌等敏感列返回给调用方。

## 常用命令

| 用途 | 命令 |
| --- | --- |
| 生成 migration | `pnpm db:generate`（= `pnpm --filter @github-account-info/db db:generate`） |
| 应用 migration | `pnpm db:migrate` |
| 本地快速推送 schema | `pnpm db:push`（仅本地，不生成 migration 文件） |
| 可视化调试 | `pnpm db:studio` |
