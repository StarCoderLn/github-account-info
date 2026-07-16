package introduction

import (
	"errors"
	"time"

	"github.com/StarCoderLn/github-account-info/apps/go-api/internal/account"
)

const TemplateV1 = "template-v1"

var (
	ErrAccountNotFound       = errors.New("github account not found")
	ErrIntroductionNotFound  = errors.New("introduction not found")
	ErrInvalidUsername       = errors.New("invalid github username")
	ErrDependencyUnavailable = errors.New("introduction dependency unavailable")
)

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

type GenerateRequest struct {
	GitHubUsername string `json:"githubUsername"`
	Regenerate     bool   `json:"regenerate"`
}

type GenerateResult struct {
	Introduction Public `json:"introduction"`
	Generated    bool   `json:"generated"`
}

type Source = account.Source
