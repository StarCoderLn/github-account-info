# 账户记录增删改查接口 — 技术设计

## 设计版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-27 | v1   | 初始设计 |

## 项目架构

- 架构类型: pnpm + Turborepo monorepo
- 涉及层:
  - **数据库层**: `packages/db/src/schema/github-account.ts` + migration
  - **接口层**: `packages/api/src/routers/account.ts` → 合并进 `appRouter`

## 功能模块设计

### 模块 1: 数据表 schema

`packages/db/src/schema/github-account.ts`

```ts
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const githubAccount = pgTable("github_account", {
  id: serial("id").primaryKey(),
  login: text("login").notNull(),
  githubId: integer("github_id").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  company: text("company"),
  location: text("location"),
  email: text("email"),
  publicRepos: integer("public_repos").notNull().default(0),
  followers: integer("followers").notNull().default(0),
  following: integer("following").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

- 从 `packages/db/src/schema/index.ts` 重新导出（当前为 `export {}`，替换为 `export * from "./github-account"`）。
- `githubId` 唯一约束 → 同一 GitHub 用户一条记录。

**涉及层及关键设计:** 用 `serial` 自增主键作为对外 id（删除/更新用），`githubId` 为业务唯一键。

### 模块 2: CRUD tRPC 路由

`packages/api/src/routers/account.ts`，使用 `db`（来自 `@github-account-info/db`）与 `drizzle-orm` 的 `eq`、`desc`。

- `list`: `publicProcedure.query` → `db.select().from(githubAccount).orderBy(desc(githubAccount.updatedAt))`
- `create`: `publicProcedure.input(insertSchema).mutation` → `db.insert(...).values(...).returning()`，捕获唯一冲突转 `CONFLICT`
- `update`: `publicProcedure.input(updateSchema).mutation` → `db.update(...).set({ ...data, updatedAt: new Date() }).where(eq(id)).returning()`，未命中转 `NOT_FOUND`
- `delete`: `publicProcedure.input(z.object({ id: z.number().int() })).mutation` → `db.delete(...).where(eq(id))`
- 合并：`routers/index.ts` 加 `account: accountRouter`。

**zod schema（与 `GithubAccount` 字段对齐）:**

- `insertSchema`: login(min1)、githubId(int)、name/avatarUrl/bio/company/location/email 可空、publicRepos/followers/following(int≥0，默认0)
- `updateSchema`: `insertSchema.partial().extend({ id: z.number().int() })`

> 可优先使用 `drizzle-zod` 的 `createInsertSchema` 减少重复；若不引入新依赖，则手写上面两个 schema。

## 接口契约

```ts
account.list():   () => GithubAccountRow[]
account.create(): (insert)  => GithubAccountRow
account.update(): (id+部分字段) => GithubAccountRow
account.delete(): ({ id })  => { id: number }
```

## 数据模型

见模块 1 的 `github_account` 表。字段集合与 `1.github.getAccount` 输出的 `GithubAccount` 保持一致，feature 3 可把拉取结果直接喂给 `account.create`。

## 安全考虑

- 写入字段走 zod 白名单，杜绝任意字段注入。
- 不存储任何 token / 凭证，仅公开账户信息。
- 唯一冲突、未命中等以 `TRPCError` 返回，不暴露底层 SQL 错误细节。

## 技术决策

| 决策         | 选项                          | 理由                                   |
| ------------ | ----------------------------- | -------------------------------------- |
| 主键         | `serial` 自增                 | 对外 CRUD 用稳定数字 id，简单           |
| 业务唯一键   | `github_id unique`            | 同一 GitHub 用户单条快照                |
| schema 校验  | zod（可选 drizzle-zod）       | 与现有 zod 栈一致，类型安全             |
| 分页         | 暂不做                        | 个人使用数据量小，YAGNI                 |
