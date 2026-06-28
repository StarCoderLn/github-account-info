# 账户记录表单页 — 技术设计

## 设计版本

| 日期       | 版本 | 说明                                               |
| ---------- | ---- | -------------------------------------------------- |
| 2026-06-27 | v1   | 初始设计：`/accounts` 单页 CRUD 表格 + Dialog 表单  |
| 2026-06-28 | v2   | 重构为 Token 管理 + 账号信息双页，移除 shadcn 表格/弹窗依赖 |

## 项目架构

- 架构类型: pnpm + Turborepo monorepo
- 涉及层（纯前端 `apps/web`）:
  - **路由层**: `apps/web/src/routes/index.tsx`（Token 管理）、`apps/web/src/routes/profile.tsx`（账号信息）
  - **工具层**: `apps/web/src/utils/token-store.ts`（localStorage Token 管理）
  - **数据层**: 复用 `apps/web/src/utils/trpc.ts` 的 `trpc` + react-query

## 路由与导航

- `__root.tsx` 提供顶部 Header：标题「GitHub 账号信息」+ 两个 Tab 导航（Token 管理 / 账号信息）。
- `/`（`index.tsx`）：Token 管理页。
- `/profile`（`profile.tsx`）：账号信息编辑页。
- 移除原 `header.tsx` 组件，导航逻辑内联到 `__root.tsx`。

## Token 管理页（`/`）

### token-store.ts（localStorage 工具）

```ts
interface SavedToken {
  id: string          // crypto.randomUUID()
  name: string        // 用户自定义名称
  token: string       // 完整 PAT（用于后续 API 调用）
  login: string       // 添加时从 GitHub 拉取的 login
  displayName: string | null
  avatarUrl: string | null
  publicRepos: number
  followers: number
  following: number
  createdAt: string   // "YYYY/MM/DD HH:mm"
}
```

存储 key：`gh_tokens`（列表）、`gh_selected_token_id`（当前选中 ID）。

### 添加流程

1. 用户填写名称 + PAT → 点「添加 Token」
2. 调用 `trpc.github.getAccount.mutate({ token })` 验证并获取账号信息
3. 成功：构造 `SavedToken` 写入 localStorage，自动设为选中，渲染卡片
4. 失败：toast 错误提示，不保存

### 账号卡片

- 2 列网格布局，每张卡片：头像 + displayName + @login + 统计数据（公开仓库 / 关注者 / 正在关注）
- 点击整张卡片 → `setSelectedTokenId(id)` + `navigate({ to: "/profile" })`
- 右上角删除按钮（阻止冒泡）→ `removeToken(id)`

## 账号信息页（`/profile`）

### 数据加载策略

```
进入页面
  ├─ 无选中 Token → 显示引导提示（跳转 Token 管理页）
  ├─ listQuery.isPending → 显示「加载中…」
  ├─ DB 有该 login 的记录 → 从 DB 填入表单（来源标注：数据库）
  └─ DB 无记录 → 调 github.getAccount 拉取（来源标注：GitHub）
```

`useEffect` 依赖 `[selectedToken?.id, listQuery.isPending]`，避免重复触发。

### 表单字段

| 字段            | 可编辑 | 说明                   |
| --------------- | ------ | ---------------------- |
| login           | 否     | 头部展示               |
| githubId        | 否     | 头部展示               |
| avatarUrl       | 否     | 头像展示               |
| name            | 是     | 姓名                   |
| bio             | 是     | 简介（textarea）       |
| company         | 是     | 公司                   |
| location        | 是     | 地址                   |
| email           | 是     | 邮箱                   |
| blog            | 是     | 博客 URL               |
| twitterUsername | 是     | Twitter 用户名         |
| publicRepos     | 否     | 统计展示               |
| followers       | 否     | 统计展示               |
| following       | 否     | 统计展示               |

### 保存逻辑

```ts
const dbRecord = listQuery.data?.find(r => r.login === selectedToken?.login)
if (dbRecord) {
  await updateMut.mutateAsync({ id: dbRecord.id, ...payload })
} else {
  await createMut.mutateAsync(payload)
}
queryClient.invalidateQueries(trpc.account.list.queryFilter())
```

空字符串统一转 `null` 后入库（`toNull` 工具函数）。

### 「从 GitHub 刷新」

- 调 `github.getAccount` 覆盖当前表单状态
- 不自动保存，用户需手动点「保存到数据库」

## 接口契约

| 接口                              | 用途               |
| --------------------------------- | ------------------ |
| `trpc.github.getAccount`          | 添加 Token / 刷新  |
| `trpc.account.list`               | 判断 DB 是否有记录 |
| `trpc.account.create`             | 首次保存           |
| `trpc.account.update`             | 更新已有记录       |

## 数据库变更（v2 新增字段）

```sql
ALTER TABLE github_account ADD COLUMN blog TEXT;
ALTER TABLE github_account ADD COLUMN twitter_username TEXT;
```

由 Drizzle migration `0001_sleepy_marvel_zombies.sql` 自动应用。

## 安全说明

- PAT 完整值存于 localStorage，适用于个人本地部署场景。
- 如需多用户部署，应改为服务端 session 加密存储，不在前端持久化 token 明文。
- token 输入框使用 `type="password"`、`autoComplete="off"`。
