---
description: TypeScript 编码风格与格式规范，统一由 Biome 与严格 tsconfig 约束。
globs: ["**/*.ts", "**/*.tsx"]
---

# 编码风格规范

本项目为 Turborepo + pnpm workspaces monorepo（Better-T-Stack），使用 Biome 统一格式化与 lint，TypeScript 全程严格模式。所有规则均可通过 `pnpm run check`（`biome check --write .`）自动校验与修复，类型通过 `pnpm run check-types`（`turbo check-types`）校验。

## 格式化（Biome formatter）

- 缩进使用 **Tab**，不使用空格（`indentStyle: "tab"`）。
- 字符串统一使用**双引号**（`quoteStyle: "double"`）。
- 提交前运行 `pnpm run check` 自动格式化、组织 import、应用安全修复。
- 不手动调整 import 顺序，交由 Biome `organizeImports` 处理。
- 以下目录/文件由 Biome 忽略，不要在其中手写规范代码：`dist`、`.turbo`、`.next`、`routeTree.gen.ts`、`convex/_generated` 等生成产物。

## TypeScript 严格约束

继承自 `@github-account-info/config` 的 `tsconfig.base.json`，禁止放宽：

- `strict: true`，禁止隐式 any。
- `noUncheckedIndexedAccess`：索引访问结果视为可能 `undefined`，必须显式收窄。
- `noUnusedLocals` / `noUnusedParameters`：禁止未使用的局部变量与参数（占位参数用 `_` 前缀）。
- `noFallthroughCasesInSwitch`：`switch` 分支必须 `break`/`return`。
- `verbatimModuleSyntax`：仅作类型用途的导入必须使用 `import type` / `export type`。
- `isolatedModules`：每个文件需可独立转译，避免跨文件的纯类型 re-export 歧义。
- 模块解析为 `bundler`，目标 `ESNext`，`type: "module"`（ESM）。

## 代码风格（Biome linter）

- 不重新赋值函数参数（`noParameterAssign`）。
- 使用 `as const` 表达字面量断言（`useAsConstAssertion`）。
- 带默认值的参数放在参数列表末尾（`useDefaultParameterLast`）。
- `enum` 成员必须显式初始化（`useEnumInitializers`）。
- 不为可推断类型写冗余注解（`noInferrableTypes`）。
- 避免无意义的 `else`（`noUselessElse`）：前置分支已 return 时直接顺写。
- 每条声明只声明一个变量（`useSingleVarDeclarator`）。
- 不用模板字面量表示无插值的纯字符串（`noUnusedTemplateLiteral`）。
- 使用 `Number.parseInt` 等命名空间方法而非全局函数（`useNumberNamespace`）。

## React / 前端（web）

- JSX 空元素使用自闭合写法（`useSelfClosingElements`）。
- `useEffect` 等依赖数组保持完整（`useExhaustiveDependencies`，info 级提示，谨慎抑制）。
- className 顺序由 Biome 自动排序，合并类名统一通过 `cn` / `clsx` / `cva`（`useSortedClasses`），不手写无序类名。

## 命名约定

- 文件与目录：kebab-case。
- 组件与类型：PascalCase；变量、函数、hooks：camelCase（hooks 以 `use` 前缀）。
- 常量：UPPER_SNAKE_CASE 或 `as const` 对象。
- workspace 包名统一 `@github-account-info/*` scope。

## 提交前检查清单

1. `pnpm run check` — Biome 格式化 + lint 通过且无残留 error。
2. `pnpm run check-types` — 全量类型检查通过。
