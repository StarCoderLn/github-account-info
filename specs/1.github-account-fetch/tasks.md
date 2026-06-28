# GitHub 账户信息拉取接口 — 任务清单

## 任务版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-27 | v1   | 初始任务 |

## 项目信息

- 项目名: github-account-info
- 架构类型: pnpm + Turborepo monorepo（Hono + tRPC）
- specs 路径: specs/1.github-account-fetch/

## 任务列表

### 功能 1: GitHub API 客户端

- [x] T-001: GitHub 客户端服务 `packages/api/src/services/github.ts`，用 fetch 调 `GET /user`，注入 `Authorization`/`User-Agent`/`Accept` 头 + 10s 超时 ~30min
- [x] T-002: 账户信息归一化（GitHub 响应 → 核心字段）+ `GithubAccount` 类型/zod 输出 schema ~15min

### 功能 2: tRPC 接口

- [x] T-003: `github.getAccount` mutation（入参 `{ token }` zod 校验、trim 非空），挂载到 `appRouter` ~30min
- [x] T-004: 错误码映射（401→UNAUTHORIZED、403/限流→TOO_MANY_REQUESTS、其它→INTERNAL_SERVER_ERROR）封装为 `TRPCError` ~15min

### 集成与测试

- [x] T-005: 接口联调测试（有效 token 返回字段、无效/空 token 报错、token 不进日志）~15min

## 依赖关系

- T-002 依赖 T-001
- T-003 依赖 T-002
- T-004 依赖 T-003
- T-005 依赖 T-004

## 风险点

- GitHub 强制要求 `User-Agent` 头，缺失会直接 403 —— 客户端服务务必带上。
- 限流（未认证或频繁调用）：通过 `x-ratelimit-remaining` 判断并给出可读提示。
- 测试需准备一个有效 PAT；可用 mock fetch 覆盖错误分支，避免真实消耗限额。
