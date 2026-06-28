# GitHub 账户信息拉取接口 — 需求规格

## 概述

提供一个 Hono/tRPC 接口，调用方传入个人 GitHub Personal Access Token（PAT），后端用该 token 调用 GitHub REST API 拉取并返回个人账户信息。

## 项目信息

- 项目名: github-account-info
- 架构类型: pnpm + Turborepo monorepo（apps/server = Hono+tRPC，packages/api = tRPC 路由，packages/db = Drizzle）

## 需求版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-27 | v1   | 初始需求 |

## 用户故事

- 作为用户，我想要传入自己的 GitHub PAT 调用一个接口，以便拿到自己的 GitHub 账户信息（用于后续展示和落库）。

## 功能需求

1. [F-001] 提供 tRPC 接口 `github.getAccount`，入参为 `{ token: string }`，调用 GitHub `GET /user` 拉取账户信息。
2. [F-002] 入参校验：token 必填、非空字符串，去除首尾空白。
3. [F-003] 将 GitHub 响应归一化为「核心账户字段」结构后返回（login、githubId、name、avatarUrl、bio、company、location、email、publicRepos、followers、following）。
4. [F-004] 错误处理与错误码映射：401（token 无效/过期）、403（限流/权限不足）、网络/超时错误，统一转换为带友好 message 的 `TRPCError`。

## 非功能需求

- 性能: 单次外部调用，需设置合理超时（建议 10s），失败快速返回。
- 安全: **token 不落库、不写日志**；调用 GitHub 时通过 `Authorization` 头传递；接口使用 mutation 而非 query，避免 token 出现在 URL/批处理缓存中。
- 兼容性: GitHub REST API v3（`https://api.github.com`），需带 `User-Agent` 头（GitHub 强制要求）。

## 验收标准

- [ ] [AC-001] 传入有效 token 时返回归一化的核心账户字段对象。
- [ ] [AC-002] 传入空/无效 token 时返回明确错误（UNAUTHORIZED / BAD_REQUEST），不抛出未捕获异常。
- [ ] [AC-003] token 不出现在任何日志、URL 或返回体中。
- [ ] [AC-004] GitHub 限流（403）时返回可读的限流提示。

## 依赖

- GitHub REST API（`GET https://api.github.com/user`）
- 现有 tRPC 基础设施（`packages/api`：`t`、`router`、`publicProcedure`）

## 开放问题

- 无（token 处理方式、返回字段范围已在 PLAN.md 决策中确认）。
