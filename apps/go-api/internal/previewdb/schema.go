package previewdb

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

const MaxPRNumber = 49_999

var ErrUnsafeConfirmation = errors.New("preview schema deletion confirmation does not match")

type Beginner interface {
	Begin(ctx context.Context) (pgx.Tx, error)
}

func SchemaName(prNumber int) (string, error) {
	if prNumber < 1 || prNumber > MaxPRNumber {
		return "", fmt.Errorf("PR number must be between 1 and %d", MaxPRNumber)
	}
	return fmt.Sprintf("pr_%d", prNumber), nil
}

func Create(ctx context.Context, db Beginner, prNumber int) error {
	schema, err := SchemaName(prNumber)
	if err != nil {
		return err
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin preview schema transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", int64(prNumber)); err != nil {
		return fmt.Errorf("lock preview schema: %w", err)
	}
	for _, statement := range createStatements(schema) {
		if _, err := tx.Exec(ctx, statement); err != nil {
			return fmt.Errorf("create preview schema objects: %w", err)
		}
	}
	if _, err := tx.Exec(ctx, seedAccountStatement(schema), prNumber); err != nil {
		return fmt.Errorf("seed preview account: %w", err)
	}
	if _, err := tx.Exec(ctx, seedIntroductionStatement(schema), prNumber); err != nil {
		return fmt.Errorf("seed preview introduction: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit preview schema: %w", err)
	}
	return nil
}

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
	identifier := pgx.Identifier{schema}.Sanitize()
	if _, err := tx.Exec(ctx, "DROP SCHEMA IF EXISTS "+identifier+" CASCADE"); err != nil {
		return fmt.Errorf("drop preview schema: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit preview schema deletion: %w", err)
	}
	return nil
}

func createStatements(schema string) []string {
	qualified := func(name string) string {
		return pgx.Identifier{schema, name}.Sanitize()
	}
	identifier := pgx.Identifier{schema}.Sanitize()
	account := qualified("github_account")
	introduction := qualified("profile_introduction")

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

func seedAccountStatement(schema string) string {
	account := pgx.Identifier{schema, "github_account"}.Sanitize()
	return `INSERT INTO ` + account + ` (
  login, github_id, name, avatar_url, bio, company, location,
  public_repos, followers, following, blog
) VALUES (
  'preview-user', 9000000000000000 + $1, 'Preview Developer', NULL,
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

func seedIntroductionStatement(schema string) string {
	account := pgx.Identifier{schema, "github_account"}.Sanitize()
	introduction := pgx.Identifier{schema, "profile_introduction"}.Sanitize()
	return `INSERT INTO ` + introduction + ` (
  github_account_id, content, generator_version, source_hash
)
SELECT
  id,
  'Preview Developer（@preview-user）正在 PR #' || $1 || ' 的隔离环境中验证个人介绍页面。这里的数据完全由 preview seed 生成，不会读取 production 账号。',
  'preview-seed-v1',
  repeat('0', 64)
FROM ` + account + `
WHERE github_id = 9000000000000000 + $1
ON CONFLICT (github_account_id) DO UPDATE SET
  content = EXCLUDED.content,
  generator_version = EXCLUDED.generator_version,
  source_hash = EXCLUDED.source_hash,
  generated_at = now(),
  updated_at = now()`
}
