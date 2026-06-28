# github-account-info

monorepo 项目(Better-T-Stack),用于 GitHub 账号信息相关能力。采用 Turborepo + pnpm workspaces 组织前端、后端与数据库三大模块,端到端 TypeScript 类型安全(tRPC + Drizzle + zod)。

## 技术栈

- 语言:TypeScript
- 前端:React + TanStack Router(`apps/web`)
- 后端:Hono + tRPC(`apps/server` + `packages/api`)
- 数据库:Drizzle ORM + PostgreSQL(`packages/db`)
- 文档站:Fumadocs(`apps/fumadocs`)
- 工具链:Turborepo、Biome、pnpm@10.24.0

## 常用命令

| 用途 | 命令 |
| --- | --- |
| 安装依赖 | `pnpm install` |
| 启动开发(全部) | `pnpm run dev` |
| 构建 | `pnpm run build` |
| 类型检查 | `pnpm run check-types` |
| Lint/格式化 | `pnpm run check` |
| 仅前端 / 仅后端 | `pnpm dev:web` / `pnpm dev:server` |
| 数据库 | `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:push` / `pnpm db:studio` |

## 目录结构

```
github-account-info/
├── apps/
│   ├── web/         # React + TanStack Router 前端
│   ├── server/      # Hono + tRPC 服务端入口
│   └── fumadocs/    # 文档站
├── packages/
│   ├── api/         # tRPC procedure 定义(端到端类型源)
│   ├── db/          # Drizzle schema 与 migration
│   ├── ui/          # 共享 UI 组件
│   ├── env/         # 环境变量校验/注入
│   └── config/      # 共享配置(ts/biome 等)
├── specs/           # 开发规格
├── docs/            # 需求/产品文档
├── turbo.json       # Turborepo 任务编排
└── pnpm-workspace.yaml
```

## 模块规范(按需引入)

- 前端开发:@rules/frontend.md
- 后端开发:@rules/backend.md
- 后端 API 规范:@rules/backend-api.md
- 数据库开发:@rules/database.md
- 编码风格:@rules/coding-style.md
- Git 工作流:@rules/git-workflow.md
- 安全规范:@rules/security.md
- 测试规范:@rules/testing.md

## 项目踩坑/教训

开发过程中持续追加的经验与坑点(自学习闭环):

@AGENTS.md
