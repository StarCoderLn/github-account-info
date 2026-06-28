# 账户记录表单页 — 任务清单

## 任务版本

| 日期       | 版本 | 说明                                    |
| ---------- | ---- | --------------------------------------- |
| 2026-06-27 | v1   | 初始任务：accounts CRUD 表格            |
| 2026-06-28 | v2   | 重构为 Token 管理 + 账号信息双页，全部完成 |

## 已完成任务

### DB / 后端变更

- [x] T-001: DB schema 新增 `blog`、`twitter_username` 字段，生成并应用 migration
- [x] T-002: `packages/api/src/services/github.ts` 新增 `blog`、`twitterUsername` 字段返回
- [x] T-003: `packages/db/src/schema/github-account.zod.ts` 同步新增两个字段的 zod 校验

### 前端基建

- [x] T-004: `apps/web/src/utils/token-store.ts`：localStorage Token 增删查、选中状态管理
- [x] T-005: `apps/web/src/routes/__root.tsx`：顶部 Header（标题 + Token 管理 / 账号信息 Tab 导航）；移除原 Header 组件、ThemeProvider、Devtools

### Token 管理页（`/`）

- [x] T-006: `apps/web/src/routes/index.tsx` 重写为 Token 管理页
- [x] T-007: 添加 Token 表单（名称 + PAT 输入 + 验证流程）
- [x] T-008: 账号卡片展示（头像 + 用户名 + 统计数据），点击跳转 Profile 页
- [x] T-009: 删除 Token 功能

### 账号信息页（`/profile`）

- [x] T-010: `apps/web/src/routes/profile.tsx` 新建账号信息编辑页
- [x] T-011: 数据加载策略（DB 优先 → GitHub 回退，来源标注）
- [x] T-012: 可编辑表单（姓名/简介/公司/地址/邮箱/博客/Twitter）
- [x] T-013: 保存逻辑（自动判断 create / update）
- [x] T-014: 「从 GitHub 刷新」按钮（手动覆盖表单，不自动入库）
- [x] T-015: 未选中 Token 时的引导提示

## 依赖关系

- T-007 依赖 T-004（token-store 工具）
- T-011 / T-013 依赖 `2.account.list / create / update`（CRUD 接口）
- T-011 / T-014 依赖 `1.github.getAccount`（GitHub 拉取接口）
- T-001 ~ T-003 为 T-012 / T-013 的前置（新字段入库）
