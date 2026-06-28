# GitHub 账号信息

基于 Turborepo + pnpm workspaces 的 monorepo 项目，用于管理多个 GitHub 账号的个人信息。通过 GitHub Personal Access Token（PAT）拉取账号数据，支持在线编辑并持久化保存到数据库。

## 功能特性

- **Token 管理**：添加多个 GitHub PAT，以账号卡片形式展示（头像 + 用户名 + 统计数据），点击卡片切换账号
- **账号信息编辑**：查看并编辑 GitHub 账号详情（姓名、简介、公司、地址、邮箱、博客、Twitter），保存到数据库
- **智能数据加载**：优先从数据库加载已保存的数据，无记录时自动从 GitHub 拉取，并标注数据来源
- **手动刷新**：支持一键从 GitHub 拉取最新数据覆盖本地，再手动保存入库
- **端到端类型安全**：tRPC + Drizzle + zod 全链路类型推导，无需手写接口类型

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React + TanStack Router + Tailwind CSS v4 |
| 后端 | Hono + tRPC |
| 数据库 | Drizzle ORM + PostgreSQL（Neon serverless） |
| 工具链 | Turborepo + pnpm workspaces + Biome + TypeScript |
| UI 组件 | shadcn/ui（共享包 `packages/ui`） |

## 项目结构

```
github-account-info/
├── apps/
│   ├── web/         # React + TanStack Router 前端（Token 管理 + 账号信息双页）
│   └── server/      # Hono + tRPC 服务端入口
├── packages/
│   ├── api/         # tRPC procedure 定义（端到端类型源）
│   ├── db/          # Drizzle schema 与 migration
│   ├── ui/          # 共享 shadcn/ui 组件
│   ├── env/         # 环境变量校验
│   └── config/      # 共享 TypeScript / Biome 配置
├── specs/           # 开发规格文档
└── docs/            # 需求文档
```

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

复制并填写服务端环境变量：

```bash
cp apps/server/.env.example apps/server/.env
```

需要配置的变量：

```env
DATABASE_URL=你的 PostgreSQL 连接串（支持 Neon serverless）
CORS_ORIGIN=http://localhost:5173
```

### 3. 初始化数据库

```bash
# 应用 migration（推荐）
pnpm db:migrate

# 或本地快速推送 schema（不生成 migration 文件）
pnpm db:push
```

### 4. 启动开发服务

```bash
# 同时启动前端和后端
pnpm dev

# 或分别启动
pnpm dev:web     # 前端 http://localhost:5173
pnpm dev:server  # 后端 http://localhost:3000
```

## 使用说明

1. 打开 `http://localhost:5173`，进入 **Token 管理** 页
2. 填写名称和 GitHub PAT（需要 `read:user` 权限），点击「添加 Token」
3. 验证成功后出现账号卡片，点击卡片进入 **账号信息** 页
4. 查看/编辑账号信息，点击「保存到数据库」持久化
5. 下次进入时自动从数据库加载，无需重新拉取

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动所有服务（开发模式） |
| `pnpm build` | 构建所有应用 |
| `pnpm check` | Biome 格式化 + lint 并自动修复 |
| `pnpm check-types` | 全仓库 TypeScript 类型检查 |
| `pnpm db:generate` | 根据 schema 生成 migration 文件 |
| `pnpm db:migrate` | 应用 migration 到数据库 |
| `pnpm db:push` | 直接推送 schema（仅本地快速迭代） |
| `pnpm db:studio` | 打开 Drizzle Studio 可视化调试 |
