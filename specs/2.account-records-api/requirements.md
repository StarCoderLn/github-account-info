# 账户记录增删改查接口 — 需求规格

## 概述

用 Drizzle 定义 `github_account` 表，并提供一组 tRPC 接口，对存储的 GitHub 账户记录做列表 / 新增 / 更新 / 删除（CRUD），供表单页调用。

## 项目信息

- 项目名: github-account-info
- 架构类型: pnpm + Turborepo monorepo（packages/db = Drizzle + Neon Postgres，packages/api = tRPC）

## 需求版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-27 | v1   | 初始需求 |

## 用户故事

- 作为用户，我想要把 GitHub 账户信息保存为记录并能增删改查，以便管理多个账户的快照数据。

## 功能需求

1. [F-001] 定义 `github_account` 表（核心账户字段 + 时间戳），并导出供其它包使用。
2. [F-002] `account.list`：返回全部账户记录（按更新时间倒序）。
3. [F-003] `account.create`：新增一条记录，入参经 zod 校验。
4. [F-004] `account.update`：按 id 更新记录，自动刷新 `updatedAt`。
5. [F-005] `account.delete`：按 id 删除记录。
6. [F-006] 全部接口入参用 zod 校验；`login`/`githubId` 唯一冲突时返回可读错误。

## 非功能需求

- 性能: 列表数据量小（个人使用），单表查询即可，无需分页（可后续扩展）。
- 安全: 仅存储公开账户信息，**不存储 token**；写操作做入参白名单，避免越权写入未定义字段。
- 兼容性: Drizzle ORM + Neon Serverless Postgres（现有 `packages/db` 配置）。

## 验收标准

- [ ] [AC-001] `db:generate` 能基于 schema 生成 migration，`db:push`/`db:migrate` 后表存在。
- [ ] [AC-002] create → list 能查到新记录；update 后字段与 `updatedAt` 变化；delete 后 list 不再返回。
- [ ] [AC-003] 重复 `githubId` 新增时返回明确的唯一冲突错误，而非未捕获异常。
- [ ] [AC-004] 非法入参（缺必填、类型错）被 zod 拦截并返回 BAD_REQUEST。

## 依赖

- 现有 `packages/db`（`createDb` / `db`、`drizzle.config.ts`、`db:*` 脚本）
- 现有 tRPC 基础设施（`packages/api`）

## 开放问题

- 字段唯一性：以 `githubId` 作为唯一键（同一 GitHub 用户只存一条）。如需允许重复快照，可在变更中调整。
