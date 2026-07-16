package account

import (
	"context"
	"database/sql"
	"errors"

	"github.com/jackc/pgx/v5"
)

var ErrNotFound = errors.New("github account not found")

type QueryRower interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type Repository struct {
	db QueryRower
}

func NewRepository(db QueryRower) *Repository {
	return &Repository{db: db}
}

func (r *Repository) FindByUsername(ctx context.Context, username string) (Source, error) {
	const query = `
SELECT
  id,
  github_id,
  login,
  name,
  avatar_url,
  bio,
  company,
  location,
  blog,
  twitter_username,
  public_repos,
  followers,
  following
FROM github_account
WHERE lower(login) = lower($1)
ORDER BY updated_at DESC
LIMIT 1`

	var source Source
	var name, avatarURL, bio, company, location, blog, twitterUsername sql.NullString
	err := r.db.QueryRow(ctx, query, username).Scan(
		&source.ID,
		&source.GitHubID,
		&source.GitHubUsername,
		&name,
		&avatarURL,
		&bio,
		&company,
		&location,
		&blog,
		&twitterUsername,
		&source.PublicRepos,
		&source.Followers,
		&source.Following,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Source{}, ErrNotFound
	}
	if err != nil {
		return Source{}, err
	}

	source.Name = nullableString(name)
	source.AvatarURL = nullableString(avatarURL)
	source.Bio = nullableString(bio)
	source.Company = nullableString(company)
	source.Location = nullableString(location)
	source.Blog = nullableString(blog)
	source.TwitterUsername = nullableString(twitterUsername)
	return source, nil
}

func nullableString(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}
