---
description: 测试与质量校验规范——本仓库以类型检查 + Biome 为质量门禁，无独立测试运行器时遵循此约定
globs:
---

# 测试规范

## 现状（按实际配置）

本仓库当前**未集成独立测试运行器**（无 vitest / jest / playwright，无 `*.config` 测试配置、无 `*.test.ts` / `*.spec.ts`）。质量门禁由两部分构成：

- **类型检查**：`pnpm run check-types`（Turborepo 聚合各包 `check-types`）——这是事实上的「测试」命令。
- **Lint / 格式化**：`pnpm run check`（根级 `biome check --write .`）。

提交前两者都必须通过：

```bash
pnpm run check-types   # 全仓库类型校验
pnpm run check         # Biome 检查并自动修复
```

各包的 `check-types` 形态不同，改动对应包时以该包脚本为准：

- `apps/web`：`vite build && tsc --noEmit`
- `apps/server`：`tsc -b`
- `packages/*`：各自的 `check-types`

## 编写测试时的约定

若需为某个特性补充真实测试，遵循以下技术栈一致性约定：

- **运行器**：统一使用 **Vitest**（与 Vite/TS ESM 生态一致），不要混入 Jest。
- **位置**：测试文件与被测源码同目录，命名 `*.test.ts` / `*.test.tsx`。
- **作用域**：测试只属于单个 workspace 包，置于该包内部，不跨包放置。
- **新增运行器时**：在对应包 `package.json` 增加 `"test": "vitest run"` 脚本，并在 `turbo.json` 注册 `test` task，使 `turbo test` 可聚合。

## 分层测试约定

- **前端（apps/web，React + TanStack Router）**
  - 组件/Hook 测试用 `@testing-library/react` + Vitest（`jsdom` 环境）。
  - 优先测试用户可见行为与交互，避免断言实现细节。
  - 共享 UI 来自 `@github-account-info/ui`，测试放在 `packages/ui` 内。

- **后端（apps/server，Hono + tRPC）**
  - tRPC procedure 通过 `appRouter.createCaller(ctx)` 直接调用进行单元测试，避免起 HTTP server。
  - 路由与业务逻辑定义在 `packages/api`，测试随之放在 `packages/api`。
  - 涉及外部依赖（DB、第三方 API）时进行 mock，单元测试不连真实服务。

- **数据库（packages/db，Drizzle + PostgreSQL）**
  - 查询/仓储逻辑测试需要 DB 时，使用独立测试库或事务回滚，禁止跑在开发/生产库上。
  - schema 变更走 migration 流程（`db:generate` / `db:migrate`），不要手改已生成的 migration。

## 验收要求

- 任何代码改动在标记完成前，`pnpm run check-types` 与 `pnpm run check` 必须全部通过。
- 新增或修改特性时，若该包已存在测试，必须同步更新对应测试并保持通过。
- 不得为了通过门禁而使用 `// @ts-ignore`、`any` 或禁用 Biome 规则来掩盖问题；如确需豁免，须就近注释说明原因。
