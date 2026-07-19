// Package previewdb 管理 PR 预览环境的独立 PostgreSQL schema、表结构和种子数据。
package previewdb

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// MaxPRNumber 同时受 ALB Listener Rule priority 上限约束。
// 数字中的下划线只提高可读性，编译后的值仍是 49999。
const MaxPRNumber = 49_999

// ErrUnsafeConfirmation 是删除确认不匹配时返回的哨兵错误。
var ErrUnsafeConfirmation = errors.New("preview schema deletion confirmation does not match")

// Beginner 表示“能够 Begin transaction 的对象”。接口名来自 Begin + er，
// pgxpool.Pool 满足它；测试也可传入只实现 Begin 的 fake。
type Beginner interface {
	Begin(ctx context.Context) (pgx.Tx, error)
}

// SchemaName 把可信范围内的 PR number 转成唯一且安全的 schema 名。
func SchemaName(prNumber int) (string, error) {
	if prNumber < 1 || prNumber > MaxPRNumber {
		return "", fmt.Errorf("PR number must be between 1 and %d", MaxPRNumber)
	}
	return fmt.Sprintf("pr_%d", prNumber), nil
}

// Create 在一个事务中创建 preview schema、表、索引和虚构种子数据。
func Create(ctx context.Context, db Beginner, prNumber int) error {
	schema, err := SchemaName(prNumber)
	if err != nil {
		return err
	}

	// 事务保证全部 DDL/seed 一起成功或一起回滚，不留下半成品 schema。
	tx, err := db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin preview schema transaction: %w", err)
	}
	// defer 后的匿名函数会在 Create 返回时执行。若已 Commit，Rollback 会返回
	// “事务已结束”，这里用 _ 明确忽略；若中途失败，它负责回滚。
	defer func() { _ = tx.Rollback(ctx) }()

	// PostgreSQL transaction advisory lock 让同一 PR 的并发 create/drop 串行执行。
	// Exec 返回 CommandTag 和 error；这里只关心 error，所以用 _ 丢弃第一个值。
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", int64(prNumber)); err != nil {
		return fmt.Errorf("lock preview schema: %w", err)
	}
	// range 遍历 slice；第一个返回值是索引，这里用 _ 忽略，只取 SQL statement。
	for _, statement := range createStatements(schema) {
		if _, err := tx.Exec(ctx, statement); err != nil {
			return fmt.Errorf("create preview schema objects: %w", err)
		}
	}
	if _, err := tx.Exec(ctx, seedAccountStatement(schema), int64(prNumber)); err != nil {
		return fmt.Errorf("seed preview account: %w", err)
	}
	// slice 后的 ... 把 []any 展开成可变参数，相当于逐个传给 Exec。
	if _, err := tx.Exec(ctx, seedIntroductionStatement(schema), previewIntroductionArgs(prNumber)...); err != nil {
		return fmt.Errorf("seed preview introduction: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit preview schema: %w", err)
	}
	return nil
}

// Drop 只有在 confirmation 精确等于 pr_<number> 时才删除 schema。
func Drop(ctx context.Context, db Beginner, prNumber int, confirmation string) error {
	schema, err := SchemaName(prNumber)
	if err != nil {
		return err
	}
	if confirmation != schema {
		return ErrUnsafeConfirmation
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin preview schema deletion: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", int64(prNumber)); err != nil {
		return fmt.Errorf("lock preview schema: %w", err)
	}
	// SQL 参数占位符不能用于表/schema 名，因此标识符必须用驱动的 Sanitize，
	// 不能直接拼接未经验证的字符串。
	identifier := pgx.Identifier{schema}.Sanitize()
	if _, err := tx.Exec(ctx, "DROP SCHEMA IF EXISTS "+identifier+" CASCADE"); err != nil {
		return fmt.Errorf("drop preview schema: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit preview schema deletion: %w", err)
	}
	return nil
}

// createStatements 生成创建 schema、账号表、索引和介绍表的 SQL 切片。
func createStatements(schema string) []string {
	// 闭包可以捕获外层 schema。qualified 是局部函数，用于统一限定表名。
	qualified := func(name string) string {
		return pgx.Identifier{schema, name}.Sanitize()
	}
	identifier := pgx.Identifier{schema}.Sanitize()
	account := qualified("github_account")
	introduction := qualified("profile_introduction")

	// []string{...} 是 slice 字面量；反引号保存多行原始 SQL。
	return []string{
		"CREATE SCHEMA IF NOT EXISTS " + identifier,
		`CREATE TABLE IF NOT EXISTS ` + account + ` (
  id serial PRIMARY KEY,
  login text NOT NULL,
  github_id bigint NOT NULL UNIQUE,
  name text,
  avatar_url text,
  bio text,
  company text,
  location text,
  email text,
  public_repos integer DEFAULT 0 NOT NULL,
  followers integer DEFAULT 0 NOT NULL,
  following integer DEFAULT 0 NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  blog text,
  twitter_username text
)`,
		`CREATE INDEX IF NOT EXISTS github_account_login_lower_idx ON ` + account + ` (lower(login))`,
		`CREATE TABLE IF NOT EXISTS ` + introduction + ` (
  id serial PRIMARY KEY,
  github_account_id integer NOT NULL UNIQUE REFERENCES ` + account + ` (id) ON DELETE CASCADE,
  content text NOT NULL,
  generator_version text NOT NULL,
  source_hash text NOT NULL,
  generated_at timestamp DEFAULT now() NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
)`,
	}
}

// seedAccountStatement 返回幂等 upsert 虚构账号的 SQL。
func seedAccountStatement(schema string) string {
	account := pgx.Identifier{schema, "github_account"}.Sanitize()
	return `INSERT INTO ` + account + ` (
  login, github_id, name, avatar_url, bio, company, location,
  public_repos, followers, following, blog
) VALUES (
  'preview-user', 9000000000000000::bigint + $1::bigint, 'Preview Developer', NULL,
  '这是 PR 独立环境中的虚构示例账号，不包含 production 数据。',
  'Preview Workspace', 'Isolated Schema', 3, 12, 4,
  'https://example.com/preview'
)
ON CONFLICT (github_id) DO UPDATE SET
  login = EXCLUDED.login,
  name = EXCLUDED.name,
  bio = EXCLUDED.bio,
  company = EXCLUDED.company,
  location = EXCLUDED.location,
  public_repos = EXCLUDED.public_repos,
  followers = EXCLUDED.followers,
  following = EXCLUDED.following,
  blog = EXCLUDED.blog,
  updated_at = now()`
}

// seedIntroductionStatement 返回幂等 upsert 虚构介绍的 SQL。
func seedIntroductionStatement(schema string) string {
	account := pgx.Identifier{schema, "github_account"}.Sanitize()
	introduction := pgx.Identifier{schema, "profile_introduction"}.Sanitize()
	return `INSERT INTO ` + introduction + ` (
  github_account_id, content, generator_version, source_hash
)
SELECT
  id,
  $2::text,
  'preview-seed-v1',
  repeat('0', 64)
FROM ` + account + `
WHERE github_id = 9000000000000000::bigint + $1::bigint
ON CONFLICT (github_account_id) DO UPDATE SET
  content = EXCLUDED.content,
  generator_version = EXCLUDED.generator_version,
  source_hash = EXCLUDED.source_hash,
  generated_at = now(),
  updated_at = now()`
}

// previewIntroductionContent 生成明确标注 PR 编号的演示文案。
func previewIntroductionContent(prNumber int) string {
	return fmt.Sprintf("Preview Developer（@preview-user）正在 PR #%d 的隔离环境中验证个人介绍页面。这里的数据完全由 preview seed 生成，不会读取 production 账号。", prNumber)
}

// previewIntroductionArgs 返回与 SQL $1/$2 顺序一致的参数切片。
// any 是 interface{} 的别名，表示值可为任意类型。
func previewIntroductionArgs(prNumber int) []any {
	return []any{int64(prNumber), previewIntroductionContent(prNumber)}
}
