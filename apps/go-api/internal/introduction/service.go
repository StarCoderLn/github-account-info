// Package introduction 包含个人介绍的领域模型、生成器、Repository 和 Service。
package introduction

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/StarCoderLn/github-account-info/apps/go-api/internal/account"
)

// 固定正则在包初始化时编译一次，所有请求复用。
var githubUsernamePattern = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$`)

// AccountReader 是 Service 对账号模块的最小只读依赖。
type AccountReader interface {
	FindByUsername(ctx context.Context, username string) (account.Source, error)
}

// Store 描述 Service 所需的介绍持久化操作。
type Store interface {
	FindByAccountID(ctx context.Context, accountID int32) (Record, error)
	Upsert(ctx context.Context, accountID int32, content, generatorVersion, sourceHash string, generatedAt time.Time) (Record, error)
	FindPublicByUsername(ctx context.Context, username string) (Public, error)
}

// Service 编排校验、读取账号、缓存判断、生成、保存和公开查询。
type Service struct {
	accounts  AccountReader
	store     Store
	generator Generator
	// 时间作为函数依赖注入，测试可替换成固定时间，避免依赖真实时钟。
	now func() time.Time
}

// NewService 创建业务 Service，并默认使用 time.Now 获取当前时间。
func NewService(accounts AccountReader, store Store, generator Generator) *Service {
	return &Service{
		accounts:  accounts,
		store:     store,
		generator: generator,
		now:       time.Now,
	}
}

// Generate 根据 username 生成或复用个人介绍。
func (s *Service) Generate(ctx context.Context, request GenerateRequest) (GenerateResult, error) {
	username := strings.TrimSpace(request.GitHubUsername)
	if !ValidGitHubUsername(username) {
		return GenerateResult{}, ErrInvalidUsername
	}

	source, err := s.accounts.FindByUsername(ctx, username)
	// Service 把 account 包的错误翻译成 introduction 领域错误，避免 HTTP 层
	// 必须了解底层 Repository 的具体实现。
	if errors.Is(err, account.ErrNotFound) {
		return GenerateResult{}, ErrAccountNotFound
	}
	if err != nil {
		// %w 包装业务错误供 errors.Is 分类；%v 只把底层错误写入消息，
		// 避免调用方把任意底层错误也当作公开稳定契约。
		return GenerateResult{}, fmt.Errorf("%w: read github account: %v", ErrDependencyUnavailable, err)
	}

	hash, err := sourceHash(source)
	if err != nil {
		return GenerateResult{}, err
	}

	// 未强制 regenerate 时，只有“资料 hash + 生成器版本”都没变化才复用缓存。
	if !request.Regenerate {
		existing, findErr := s.store.FindByAccountID(ctx, source.ID)
		if findErr == nil && existing.SourceHash == hash && existing.GeneratorVersion == s.generator.Version() {
			public, err := s.GetPublic(ctx, source.GitHubUsername)
			return GenerateResult{Introduction: public, Generated: false}, err
		}
		if findErr != nil && !errors.Is(findErr, ErrIntroductionNotFound) {
			return GenerateResult{}, fmt.Errorf("%w: read existing introduction: %v", ErrDependencyUnavailable, findErr)
		}
	}

	content, err := s.generator.Generate(ctx, source)
	if err != nil {
		return GenerateResult{}, err
	}
	// Upsert 的 Record 返回值当前不需要，用 _ 丢弃；只处理 error。
	if _, err := s.store.Upsert(ctx, source.ID, content, s.generator.Version(), hash, s.now().UTC()); err != nil {
		return GenerateResult{}, fmt.Errorf("%w: save introduction: %v", ErrDependencyUnavailable, err)
	}

	public, err := s.GetPublic(ctx, source.GitHubUsername)
	if err != nil {
		return GenerateResult{}, err
	}
	return GenerateResult{Introduction: public, Generated: true}, nil
}

// GetPublic 校验 username 并读取公开视图，同时统一转换依赖错误。
func (s *Service) GetPublic(ctx context.Context, username string) (Public, error) {
	username = strings.TrimSpace(username)
	if !ValidGitHubUsername(username) {
		return Public{}, ErrInvalidUsername
	}
	result, err := s.store.FindPublicByUsername(ctx, username)
	if errors.Is(err, ErrIntroductionNotFound) {
		return Public{}, err
	}
	if err != nil {
		return Public{}, fmt.Errorf("%w: read public introduction: %v", ErrDependencyUnavailable, err)
	}
	return result, nil
}

// ValidGitHubUsername 同时检查总体格式，并排除 GitHub 不允许的连续连字符。
func ValidGitHubUsername(username string) bool {
	return githubUsernamePattern.MatchString(username) && !strings.Contains(username, "--")
}

// sourceHash 只序列化会影响介绍文案的字段，并计算稳定 SHA-256；
// 无关字段变化不会导致缓存失效。
func sourceHash(source account.Source) (string, error) {
	// 匿名 struct 只在当前函数中使用，避免为一次性 hash payload 暴露新类型。
	payload, err := json.Marshal(struct {
		GitHubID       int64   `json:"githubId"`
		GitHubUsername string  `json:"githubUsername"`
		Name           *string `json:"name"`
		Bio            *string `json:"bio"`
		Company        *string `json:"company"`
		Location       *string `json:"location"`
		PublicRepos    int32   `json:"publicRepos"`
		Followers      int32   `json:"followers"`
		Following      int32   `json:"following"`
	}{
		GitHubID:       source.GitHubID,
		GitHubUsername: source.GitHubUsername,
		Name:           source.Name,
		Bio:            source.Bio,
		Company:        source.Company,
		Location:       source.Location,
		PublicRepos:    source.PublicRepos,
		Followers:      source.Followers,
		Following:      source.Following,
	})
	if err != nil {
		return "", err
	}
	// Sum256 返回 [32]byte 固定长度数组；sum[:] 把整个数组切成 []byte，
	// 交给 hex 编码为 64 个十六进制字符。
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:]), nil
}
