// Package introduction 包含个人介绍的领域模型、生成器、Repository 和 Service。
package introduction

import (
	"errors"
	"time"

	"github.com/StarCoderLn/github-account-info/apps/go-api/internal/account"
)

// TemplateV1 标识当前生成算法版本；算法变化时升级版本可使旧缓存失效。
const TemplateV1 = "template-v1"

// 这些 package-level var 是业务哨兵错误，HTTP 层通过 errors.Is 稳定分类。
var (
	ErrAccountNotFound       = errors.New("github account not found")
	ErrIntroductionNotFound  = errors.New("introduction not found")
	ErrInvalidUsername       = errors.New("invalid github username")
	ErrDependencyUnavailable = errors.New("introduction dependency unavailable")
)

// Record 对应 profile_introduction 表的一行内部持久化记录。
type Record struct {
	ID               int32
	GitHubAccountID  int32
	Content          string
	GeneratorVersion string
	SourceHash       string
	GeneratedAt      time.Time
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// Public 是公开 API 返回的完整个人介绍视图。
// 反引号中的 `json:"..."` 是 struct tag，encoding/json 用它决定 JSON 字段名。
type Public struct {
	GitHubID         int64     `json:"githubId"`
	GitHubUsername   string    `json:"githubUsername"`
	Name             *string   `json:"name"`
	AvatarURL        *string   `json:"avatarUrl"`
	Bio              *string   `json:"bio"`
	Company          *string   `json:"company"`
	Location         *string   `json:"location"`
	Blog             *string   `json:"blog"`
	TwitterUsername  *string   `json:"twitterUsername"`
	PublicRepos      int32     `json:"publicRepos"`
	Followers        int32     `json:"followers"`
	Following        int32     `json:"following"`
	Introduction     string    `json:"introduction"`
	GeneratorVersion string    `json:"generatorVersion"`
	GeneratedAt      time.Time `json:"generatedAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

// GenerateRequest 是生成接口的 JSON 请求体。
type GenerateRequest struct {
	GitHubUsername string `json:"githubUsername"`
	Regenerate     bool   `json:"regenerate"`
}

// GenerateResult 中 Generated 表示本次是否真的重新生成，而非复用缓存。
type GenerateResult struct {
	Introduction Public `json:"introduction"`
	Generated    bool   `json:"generated"`
}

// Source 是类型别名，不是新类型；introduction.Source 与 account.Source 完全相同，
// 可直接互相赋值，同时让 Generator 接口保持领域内的命名可读性。
type Source = account.Source
