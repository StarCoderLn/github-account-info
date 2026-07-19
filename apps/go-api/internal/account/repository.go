// Package account 定义 GitHub 账号领域数据及其数据库读取逻辑。
package account

import (
	"context"
	"database/sql"
	"errors"

	"github.com/jackc/pgx/v5"
)

// ErrNotFound 是可比较的哨兵错误。调用方用 errors.Is 判断账号不存在，
// 不依赖错误文字，从而能稳定映射成业务层语义。
var ErrNotFound = errors.New("github account not found")

// QueryRower 是 Repository 对数据库的最小依赖。
// 参数 args ...any 是可变参数：调用者可传任意数量、任意类型的 SQL 参数。
type QueryRower interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Repository 封装账号查询。db 使用接口而不是具体 *pgxpool.Pool，便于测试替换。
type Repository struct {
	db QueryRower
}

// NewRepository 创建 Repository。返回指针避免复制依赖并保持常见构造函数风格。
func NewRepository(db QueryRower) *Repository {
	return &Repository{db: db}
}

// FindByUsername 按不区分大小写的 GitHub username 读取最新账号资料。
func (r *Repository) FindByUsername(ctx context.Context, username string) (Source, error) {
	// 反引号定义原始字符串，可直接书写多行 SQL 而不用转义换行。
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

	// var 声明会得到类型零值；sql.NullString 能区分 SQL NULL 和空字符串。
	var source Source
	var name, avatarURL, bio, company, location, blog, twitterUsername sql.NullString
	// $1 是 PostgreSQL 参数占位符。值通过驱动单独传递，不能被当成 SQL 执行，
	// 从而避免把 username 直接拼接进语句造成注入。
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
	// errors.Is 能识别被 %w 包装过的错误，比 err == target 更稳健。
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

// nullableString 把 database/sql 的 NullString 转成领域模型使用的 *string。
func nullableString(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	// & 取变量地址。Go 的逃逸分析会把需要在函数返回后继续存在的值放到堆上，
	// 因此返回局部字段的指针是安全的。
	return &value.String
}
