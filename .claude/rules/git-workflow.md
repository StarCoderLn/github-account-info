---
description: Git 工作流与提交规范（monorepo / Turborepo + pnpm workspaces）
globs:
---

# Git Workflow

适用于本仓库（Turborepo + pnpm workspaces，`apps/*` 与 `packages/*`）的版本控制约定。提交前必须保证类型检查与代码风格检查通过。

## 分支

- `main` 为主分支，受保护，禁止直接 push。
- 从 `main` 切分功能分支，命名采用 `<type>/<scope>-<short-desc>`：
  - `feat/web-login-page`、`fix/server-trpc-auth`、`chore/db-migrate`
  - `scope` 优先使用受影响的 workspace 名（`web` / `server` / `db` / `api` / `ui` / `config` / `env` / `fumadocs`），跨包改动用 `repo`。
- 一个分支聚焦一个目的；不要把无关改动混入同一分支。

## 提交信息（Conventional Commits）

格式：`<type>(<scope>): <subject>`

- **type**：`feat` | `fix` | `refactor` | `perf` | `docs` | `test` | `chore` | `build` | `ci`
- **scope**：受影响的 workspace（如 `web`、`server`、`db`、`api`、`ui`）；多包或全局用 `repo`。
- **subject**：祈使句、现在时、不加句号，建议中文或英文保持一致。
- 破坏性变更在正文加 `BREAKING CHANGE:` 段落。

示例：

```
feat(server): 新增 GitHub 账号信息 tRPC procedure
fix(web): 修复 TanStack Router 路由懒加载报错
chore(db): 生成并应用 Drizzle migration
```

## 提交前检查（必须本地通过）

按改动范围执行，建议全部通过后再提交：

- 类型检查：`pnpm run check-types`（= `turbo check-types`）
- 代码风格 + 自动修复：`pnpm run check`（= `biome check --write .`）
- 构建（涉及构建产物或较大改动时）：`pnpm run build`

仅改动单个 workspace 时可用过滤器缩小范围，例如 `turbo -F web check-types`。

## 数据库改动

涉及 `packages/db`（Drizzle ORM + PostgreSQL）的 schema 改动：

1. 修改 schema 后执行 `pnpm run db:generate` 生成 migration。
2. 将生成的 migration 文件一并纳入同一提交。
3. 不要手工编辑已生成并提交过的 migration；需要变更时新增 migration。
4. 提交信息使用 `scope: db`。

## Pull Request

- 目标分支为 `main`，标题沿用 Conventional Commits 格式。
- PR 描述说明：动机、改动范围（列出受影响 workspace）、验证方式（已跑的检查命令）。
- 合并前确保 CI（类型检查 / 风格检查 / 构建）通过。
- 优先使用 squash 合并，保持 `main` 历史线性、每个 PR 一条规范化提交。

## 约定补充

- 不提交本地环境文件与密钥（`.env*`），改动 env 约束时同步更新 `packages/env`。
- 锁文件 `pnpm-lock.yaml` 随依赖变更一并提交。
- 仅在用户明确要求时执行 commit / push；默认只在工作区准备改动。
