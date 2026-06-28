# 账户记录增删改查接口 — 任务清单

## 任务版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-27 | v1   | 初始任务 |

## 项目信息

- 项目名: github-account-info
- 架构类型: pnpm + Turborepo monorepo（Drizzle + Neon Postgres / tRPC）
- specs 路径: specs/2.account-records-api/

## 任务列表

### 功能 1: 数据表

- [x] T-001: `github_account` Drizzle schema（核心字段 + 时间戳，`github_id` 唯一），从 `schema/index.ts` 导出 ~15min
- [x] T-002: 生成 migration（`pnpm db:generate`）+ insert/update zod schema（或 drizzle-zod）~15min

### 功能 2: CRUD 接口

- [x] T-003: `account.list` query（按 updatedAt 倒序）~15min
- [x] T-004: `account.create` mutation（zod 校验 + 唯一冲突 → CONFLICT），挂载到 appRouter ~30min
- [x] T-005: `account.update` mutation（按 id 更新、刷新 updatedAt、未命中 → NOT_FOUND）~30min
- [x] T-006: `account.delete` mutation（按 id 删除）~15min

### 集成与测试

- [x] T-007: CRUD 联调测试（create→list→update→delete 闭环 + 唯一冲突/非法入参分支）~15min

## 依赖关系

- T-002 依赖 T-001
- T-003 / T-004 / T-005 / T-006 依赖 T-002（需表和 schema 就绪）
- T-007 依赖 T-003~T-006
- 跨 feature：feature 3 的 `3.T-005` 依赖本 feature 的 `2.T-004`/`2.T-005`/`2.T-006`

## 风险点

- Neon serverless 需有效 `DATABASE_URL`；`db:push`/`migrate` 前确认 `apps/server/.env`。
- 唯一冲突错误码因驱动而异，捕获时按 `error.code`/message 兜底转 `CONFLICT`。
- `schema/index.ts` 当前是 `export {}`，改导出时勿遗漏其它已有导出。
