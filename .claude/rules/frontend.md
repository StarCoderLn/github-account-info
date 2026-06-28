---
description: Web 前端开发规范（React + TanStack Router + tRPC + shadcn/ui，apps/web）
globs: apps/web/**
---

# 前端规范

## 技术栈

- 框架：React + Vite（入口 `apps/web`），SPA，无 RSC（`components.json` `rsc: false`）。
- 路由：TanStack Router，文件式路由位于 `src/routes/`。`routeTree.gen.ts` 为自动生成产物，不要手动编辑（Biome 已忽略）。
- 数据层：tRPC client + TanStack Query。统一从 `src/utils/trpc.ts` 导出的 `trpc` / `trpcClient` / `queryClient` 接入，不要在组件内另建 client。
- 类型：TypeScript，`AppRouter` 类型来自 `@github-account-info/api`，保持端到端类型安全，不手写接口类型。
- 样式：Tailwind CSS v4（通过 `@tailwindcss/vite`），全局样式在 `packages/ui/src/styles/globals.css`。
- UI 组件：shadcn/ui（style `base-lyra`，baseColor `neutral`，CSS 变量主题），共享组件在 `@github-account-info/ui`。
- 图标：lucide-react；Toast：sonner（`toast`）；表单：react-hook-form + `@hookform/resolvers` + zod；主题：next-themes。

## 目录与导入

- 页面/路由放 `src/routes/`；局部业务组件放 `src/components/`；工具放 `src/utils/`。
- 跨应用复用的 UI 组件放共享包 `packages/ui`（`@github-account-info/ui`），不要在 web 内重复实现 shadcn 基础组件。
- 使用路径别名：
  - `@/components`、`@/lib`、`@/hooks` 指向 web 内部。
  - `@github-account-info/ui/components`（UI 组件）、`@github-account-info/ui/lib/utils`（含 `cn`）。
- 环境变量统一经 `@github-account-info/env/web` 的 `env` 读取，禁止直接裸用 `import.meta.env`。

## 数据请求

- 查询/变更通过 `trpc` options proxy 配合 TanStack Query 使用，享受类型推导与缓存。
- 全局查询错误已在 `queryClient` 的 `QueryCache.onError` 统一弹 toast 并提供 retry，组件层无需重复处理通用错误。
- 变更成功/失败后按需 `invalidate` 相关查询以刷新数据。

## 样式约定

- 优先使用 Tailwind 原子类；动态拼接 class 用 `cn`（来自 `@github-account-info/ui/lib/utils`）。
- Tailwind class 排序由 Biome `useSortedClasses` 自动修复，识别 `clsx` / `cva` / `cn`，新增封装函数需同步该配置。
- 主题色基于 CSS 变量，避免硬编码颜色值。改动前先看同目录既有写法。

## 代码风格（Biome 强制）

- 缩进用 Tab，字符串用双引号。
- 遵循 lint 规则：自闭合元素（`useSelfClosingElements`）、`as const`（`useAsConstAssertion`）、不写多余 `else`（`noUselessElse`）、不可推断类型不显式标注（`noInferrableTypes`）、单变量声明（`useSingleVarDeclarator`）等。
- React hooks 依赖：`useExhaustiveDependencies` 为 info 级提示，新增 effect 时核对依赖数组。

## 常用命令

- 仅启动 web：`pnpm dev:web`（或根 `pnpm dev` 起全部）。
- 类型检查/构建校验：`pnpm check-types`（web 内为 `vite build && tsc --noEmit`）。
- 构建：`pnpm build`。
- Lint/格式化：提交前跑 `pnpm check`（`biome check --write .`）自动格式化与组织导入。
