# GitHub 账号信息

基于 Turborepo + pnpm workspaces 的 monorepo 项目，用于管理多个 GitHub 账号的个人信息。通过 GitHub Personal Access Token（PAT）拉取账号数据，支持在线编辑并持久化保存到数据库。

## 功能特性

- **Token 管理**：添加多个 GitHub PAT，以账号卡片形式展示（头像 + 用户名 + 统计数据），通过卡片按钮选择后续操作
- **账号信息编辑**：查看并编辑 GitHub 账号详情（姓名、简介、公司、地址、邮箱、博客、Twitter），保存修改
- **智能数据加载**：优先从数据库加载已保存的数据，无记录时自动从 GitHub 拉取，并标注数据来源
- **手动刷新**：支持一键从 GitHub 拉取最新数据覆盖本地，再手动保存入库
- **个人介绍生成**：Go 根据已经保存的 GitHub username 与账号资料生成稳定的中文介绍，第一版不调用 AI
- **公开个人主页**：通过 `/u/$username` 无登录读取已发布的个人介绍，不需要 GitHub PAT
- **渐进式 Go 迁移**：production 保留现有 Node Lambda/tRPC 账号管理链路；个人介绍生成经 Cloud Map 调用 Go，公开读取经 VPC Link 进入 Go
- **异步发布验证**：个人介绍生成后经 SNS、SQS 触发 Lambda 回读公开 API，持续失败的发布验证进入 DLQ
- **稳定性验证**：CloudWatch Synthetics 巡检公开入口；Node Lambda 与 Go 公网 API 均支持 10% 灰度发布
- **AI Ops 调查**：CloudWatch 告警或 `/ops` 手工触发 Mastra Agent，使用 GitHub Models 和项目限定的 AWS 只读工具生成可审计结论
- **真实用户性能监控**：浏览器 SDK 采集 LCP、INP、CLS、FCP、TTFB，经
  SQS 与独立 ECS 服务清洗后在 `/performance` 展示真实分位数
- **端到端类型安全**：tRPC + Drizzle + zod 全链路类型推导，无需手写接口类型

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React + TanStack Router + Tailwind CSS v4 |
| 后端 | Node Lambda（Hono + tRPC）与 Go REST API |
| 数据库 | Drizzle ORM + PostgreSQL（当前生产环境为 Amazon RDS） |
| 工具链 | Turborepo + pnpm workspaces + Biome + TypeScript |
| UI 组件 | shadcn/ui（共享包 `packages/ui`） |

## 项目结构

```
github-account-info/
├── apps/
│   ├── web/         # React + TanStack Router 前端
│   ├── server/      # Node Hono + tRPC 服务端入口
│   ├── go-api/      # 个人介绍生成与公开读取 REST API
│   ├── ai-ops-agent/ # Mastra 调查 Agent 与告警/SQS Lambda handlers
│   ├── performance-processor/ # SQS 性能事件清洗与 PostgreSQL 持久化
│   └── profile-event-consumer/ # SQS 个人介绍事件消费者
├── packages/
│   ├── api/         # tRPC procedure 定义（端到端类型源）
│   ├── events/      # SNS/SQS 共享事件契约
│   ├── ai-ops-schema/ # Incident、证据与建议动作共享契约
│   ├── performance-schema/ # 性能事件、批次与统计筛选共享契约
│   ├── performance-sdk/ # 浏览器 RUM 采集、缓冲、脱敏与传输
│   ├── db/          # Drizzle schema 与 migration
│   ├── preview-environment/ # Cloudflare 与 CodeBuild 共享的 PR preview key
│   ├── ui/          # 共享 shadcn/ui 组件
│   ├── env/         # 环境变量校验
│   └── config/      # 共享 TypeScript / Biome 配置
├── infra/           # AWS 账号身份、运行资源 IaC 与跨账号迁移手册
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
DATABASE_URL=你的 PostgreSQL 连接串
CORS_ORIGIN=http://localhost:3001
GO_API_INTERNAL_URL=http://localhost:8080
MANAGEMENT_API_ENABLED=true
AI_OPS_INCIDENT_TABLE= # 未部署 AI Ops 时留空
AI_OPS_QUEUE_URL=      # 未部署 AI Ops 时留空
PERFORMANCE_QUEUE_URL= # 未部署 Feature 7 时留空
```

前端环境变量：

```env
VITE_SERVER_URL=http://localhost:3000
VITE_GO_API_URL=http://localhost:8080
VITE_PERFORMANCE_ENABLED=false
VITE_APP_ENVIRONMENT=development
VITE_APP_RELEASE=local
```

### 3. 初始化数据库

```bash
# 应用 migration（推荐）
pnpm db:migrate

# 或本地快速推送 schema（不生成 migration 文件）
pnpm db:push
```

### 4. 启动开发服务

本项目的本地配置统一使用 SSM 隧道的 `127.0.0.1:5433`。保持两个终端运行即可：

```bash
# 终端 1：保持数据库隧道运行
pnpm db:tunnel

# 终端 2：自动加载各应用的 .env.local，并同时启动三个应用
pnpm dev
```

启动后可访问：

- Web：`http://localhost:3001`
- Node API：`http://localhost:3000`
- Go API：`http://localhost:8080`

如只需调试单个应用，也可以分别启动：

```bash
pnpm dev:web     # 前端 http://localhost:3001
pnpm dev:server  # 后端 http://localhost:3000
pnpm dev:go      # Go API http://localhost:8080
```

## 使用说明

1. 打开 `http://localhost:3001`，进入 **Token 管理** 页
2. 填写名称和 GitHub PAT（需要 `read:user` 权限），点击「添加 Token」
3. 验证成功后出现账号卡片，点击「查看并编辑」进入 **账号信息** 页
4. 查看/编辑账号信息，点击「保存」持久化修改
5. 点击卡片上的「生成个人介绍」，由 Node 调用 Go 内部接口生成并展示结果
6. 通过 `/u/<GitHub username>` 查看无需登录的公开个人主页
7. 部署性能链路后通过 `/performance` 查看五项 Web Vitals、错误率和 route 对比

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动所有服务（开发模式） |
| `pnpm dev:docs` | 单独启动文档站 |
| `pnpm dev:go` | 启动 Go REST API |
| `pnpm build` | 构建所有应用 |
| `pnpm check` | Biome 格式化 + lint 并自动修复 |
| `pnpm check-types` | 全仓库 TypeScript 类型检查 |
| `pnpm check:infra` | 校验 API Gateway、production 与 PR 基础设施安全边界 |
| `pnpm db:generate` | 根据 schema 生成 migration 文件 |
| `pnpm db:migrate` | 应用 migration 到数据库 |
| `pnpm db:push` | 直接推送 schema（仅本地快速迭代） |
| `pnpm db:studio` | 打开 Drizzle Studio 可视化调试 |
| `pnpm migration:render-aws-parameters` | 从目标账号 Stack Outputs 生成迁移参数 |

## AWS 账号迁移

账号级 GitHub OIDC/部署 Role 由
[`infra/aws-account-foundation.yaml`](./infra/aws-account-foundation.yaml) 管理。
完整的源账号备份、目标账号部署顺序、Cloudflare 切流、回滚与旧账号清理门禁见
[`infra/AWS_ACCOUNT_MIGRATION.md`](./infra/AWS_ACCOUNT_MIGRATION.md)。迁移执行者和
AI 必须先读取该文档。新账号的网络、加密 RDS 与可选 SSM 堡垒机由
[`infra/aws-network-database.yaml`](./infra/aws-network-database.yaml) 管理，
下游参数通过 `infra/scripts/render-account-migration-parameters.mjs` 从 Stack
Outputs 生成。
