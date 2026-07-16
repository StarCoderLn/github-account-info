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

var githubUsernamePattern = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$`)

type AccountReader interface {
	FindByUsername(ctx context.Context, username string) (account.Source, error)
}

type Store interface {
	FindByAccountID(ctx context.Context, accountID int32) (Record, error)
	Upsert(ctx context.Context, accountID int32, content, generatorVersion, sourceHash string, generatedAt time.Time) (Record, error)
	FindPublicByUsername(ctx context.Context, username string) (Public, error)
}

type Service struct {
	accounts  AccountReader
	store     Store
	generator Generator
	now       func() time.Time
}

func NewService(accounts AccountReader, store Store, generator Generator) *Service {
	return &Service{
		accounts:  accounts,
		store:     store,
		generator: generator,
		now:       time.Now,
	}
}

func (s *Service) Generate(ctx context.Context, request GenerateRequest) (GenerateResult, error) {
	username := strings.TrimSpace(request.GitHubUsername)
	if !ValidGitHubUsername(username) {
		return GenerateResult{}, ErrInvalidUsername
	}

	source, err := s.accounts.FindByUsername(ctx, username)
	if errors.Is(err, account.ErrNotFound) {
		return GenerateResult{}, ErrAccountNotFound
	}
	if err != nil {
		return GenerateResult{}, fmt.Errorf("%w: read github account: %v", ErrDependencyUnavailable, err)
	}

	hash, err := sourceHash(source)
	if err != nil {
		return GenerateResult{}, err
	}

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
	if _, err := s.store.Upsert(ctx, source.ID, content, s.generator.Version(), hash, s.now().UTC()); err != nil {
		return GenerateResult{}, fmt.Errorf("%w: save introduction: %v", ErrDependencyUnavailable, err)
	}

	public, err := s.GetPublic(ctx, source.GitHubUsername)
	if err != nil {
		return GenerateResult{}, err
	}
	return GenerateResult{Introduction: public, Generated: true}, nil
}

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

func ValidGitHubUsername(username string) bool {
	return githubUsernamePattern.MatchString(username) && !strings.Contains(username, "--")
}

func sourceHash(source account.Source) (string, error) {
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
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:]), nil
}
