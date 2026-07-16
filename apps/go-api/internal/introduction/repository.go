package introduction

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type DB interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type Repository struct {
	db DB
}

func NewRepository(db DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) FindByAccountID(ctx context.Context, accountID int32) (Record, error) {
	const query = `
SELECT id, github_account_id, content, generator_version, source_hash, generated_at, created_at, updated_at
FROM profile_introduction
WHERE github_account_id = $1`

	var record Record
	err := r.db.QueryRow(ctx, query, accountID).Scan(
		&record.ID,
		&record.GitHubAccountID,
		&record.Content,
		&record.GeneratorVersion,
		&record.SourceHash,
		&record.GeneratedAt,
		&record.CreatedAt,
		&record.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Record{}, ErrIntroductionNotFound
	}
	return record, err
}

func (r *Repository) Upsert(ctx context.Context, accountID int32, content, generatorVersion, sourceHash string, generatedAt time.Time) (Record, error) {
	const query = `
INSERT INTO profile_introduction (
  github_account_id, content, generator_version, source_hash, generated_at
) VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (github_account_id) DO UPDATE SET
  content = EXCLUDED.content,
  generator_version = EXCLUDED.generator_version,
  source_hash = EXCLUDED.source_hash,
  generated_at = EXCLUDED.generated_at,
  updated_at = now()
RETURNING id, github_account_id, content, generator_version, source_hash, generated_at, created_at, updated_at`

	var record Record
	err := r.db.QueryRow(ctx, query, accountID, content, generatorVersion, sourceHash, generatedAt).Scan(
		&record.ID,
		&record.GitHubAccountID,
		&record.Content,
		&record.GeneratorVersion,
		&record.SourceHash,
		&record.GeneratedAt,
		&record.CreatedAt,
		&record.UpdatedAt,
	)
	return record, err
}

func (r *Repository) FindPublicByUsername(ctx context.Context, username string) (Public, error) {
	const query = `
SELECT
  account.github_id,
  account.login,
  account.name,
  account.avatar_url,
  account.bio,
  account.company,
  account.location,
  account.blog,
  account.twitter_username,
  account.public_repos,
  account.followers,
  account.following,
  introduction.content,
  introduction.generator_version,
  introduction.generated_at,
  introduction.updated_at
FROM github_account AS account
JOIN profile_introduction AS introduction ON introduction.github_account_id = account.id
WHERE lower(account.login) = lower($1)
ORDER BY account.updated_at DESC
LIMIT 1`

	var result Public
	var name, avatarURL, bio, company, location, blog, twitterUsername sql.NullString
	err := r.db.QueryRow(ctx, query, username).Scan(
		&result.GitHubID,
		&result.GitHubUsername,
		&name,
		&avatarURL,
		&bio,
		&company,
		&location,
		&blog,
		&twitterUsername,
		&result.PublicRepos,
		&result.Followers,
		&result.Following,
		&result.Introduction,
		&result.GeneratorVersion,
		&result.GeneratedAt,
		&result.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Public{}, ErrIntroductionNotFound
	}
	if err != nil {
		return Public{}, err
	}

	result.Name = nullableString(name)
	result.AvatarURL = nullableString(avatarURL)
	result.Bio = nullableString(bio)
	result.Company = nullableString(company)
	result.Location = nullableString(location)
	result.Blog = nullableString(blog)
	result.TwitterUsername = nullableString(twitterUsername)
	return result, nil
}

func nullableString(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}
