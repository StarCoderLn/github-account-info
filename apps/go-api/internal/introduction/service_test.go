package introduction

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/StarCoderLn/github-account-info/apps/go-api/internal/account"
)

type fakeAccountReader struct {
	source account.Source
	err    error
	calls  int
}

func (f *fakeAccountReader) FindByUsername(_ context.Context, _ string) (account.Source, error) {
	f.calls++
	return f.source, f.err
}

type fakeStore struct {
	existing        Record
	findExistingErr error
	public          Public
	publicErr       error
	upsertCalls     int
	upsertContent   string
	upsertVersion   string
	upsertHash      string
}

func (f *fakeStore) FindByAccountID(_ context.Context, _ int32) (Record, error) {
	return f.existing, f.findExistingErr
}

func (f *fakeStore) Upsert(_ context.Context, accountID int32, content, generatorVersion, sourceHash string, generatedAt time.Time) (Record, error) {
	f.upsertCalls++
	f.upsertContent = content
	f.upsertVersion = generatorVersion
	f.upsertHash = sourceHash
	return Record{
		GitHubAccountID:  accountID,
		Content:          content,
		GeneratorVersion: generatorVersion,
		SourceHash:       sourceHash,
		GeneratedAt:      generatedAt,
	}, nil
}

func (f *fakeStore) FindPublicByUsername(_ context.Context, _ string) (Public, error) {
	return f.public, f.publicErr
}

type fakeGenerator struct {
	content string
	calls   int
}

func (f *fakeGenerator) Version() string { return TemplateV1 }

func (f *fakeGenerator) Generate(_ context.Context, _ Source) (string, error) {
	f.calls++
	return f.content, nil
}

func testSource() account.Source {
	name := "The Octocat"
	return account.Source{
		ID:             7,
		GitHubID:       1,
		GitHubUsername: "octocat",
		Name:           &name,
		PublicRepos:    8,
		Followers:      10,
		Following:      2,
	}
}

func TestGenerateCreatesIntroductionFromExistingAccount(t *testing.T) {
	source := testSource()
	accounts := &fakeAccountReader{source: source}
	store := &fakeStore{
		findExistingErr: ErrIntroductionNotFound,
		public: Public{
			GitHubUsername:   source.GitHubUsername,
			Introduction:     "generated content",
			GeneratorVersion: TemplateV1,
		},
	}
	generator := &fakeGenerator{content: "generated content"}
	service := NewService(accounts, store, generator)

	result, err := service.Generate(context.Background(), GenerateRequest{GitHubUsername: "octocat"})
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if !result.Generated {
		t.Fatal("Generated = false, want true")
	}
	if generator.calls != 1 || store.upsertCalls != 1 {
		t.Fatalf("generator calls = %d, upsert calls = %d, want 1 each", generator.calls, store.upsertCalls)
	}
	if store.upsertVersion != TemplateV1 || store.upsertHash == "" {
		t.Fatalf("upsert version/hash = %q/%q, want template-v1 and hash", store.upsertVersion, store.upsertHash)
	}
}

func TestGenerateReusesCurrentIntroduction(t *testing.T) {
	source := testSource()
	hash, err := sourceHash(source)
	if err != nil {
		t.Fatalf("sourceHash() error = %v", err)
	}
	store := &fakeStore{
		existing: Record{SourceHash: hash, GeneratorVersion: TemplateV1},
		public:   Public{GitHubUsername: "octocat", Introduction: "cached"},
	}
	generator := &fakeGenerator{content: "new"}
	service := NewService(&fakeAccountReader{source: source}, store, generator)

	result, err := service.Generate(context.Background(), GenerateRequest{GitHubUsername: "octocat"})
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if result.Generated {
		t.Fatal("Generated = true, want cached result")
	}
	if generator.calls != 0 || store.upsertCalls != 0 {
		t.Fatalf("generator/upsert calls = %d/%d, want 0/0", generator.calls, store.upsertCalls)
	}
}

func TestGenerateRegenerateBypassesCache(t *testing.T) {
	source := testSource()
	hash, err := sourceHash(source)
	if err != nil {
		t.Fatalf("sourceHash() error = %v", err)
	}
	store := &fakeStore{
		existing: Record{SourceHash: hash, GeneratorVersion: TemplateV1},
		public:   Public{GitHubUsername: "octocat", Introduction: "new"},
	}
	generator := &fakeGenerator{content: "new"}
	service := NewService(&fakeAccountReader{source: source}, store, generator)

	result, err := service.Generate(context.Background(), GenerateRequest{GitHubUsername: "octocat", Regenerate: true})
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if !result.Generated || generator.calls != 1 || store.upsertCalls != 1 {
		t.Fatalf("generated/calls = %t/%d/%d, want true/1/1", result.Generated, generator.calls, store.upsertCalls)
	}
}

func TestGenerateRejectsInvalidUsernameBeforeDatabaseRead(t *testing.T) {
	accounts := &fakeAccountReader{}
	service := NewService(accounts, &fakeStore{}, &fakeGenerator{})

	_, err := service.Generate(context.Background(), GenerateRequest{GitHubUsername: "not a username"})
	if !errors.Is(err, ErrInvalidUsername) {
		t.Fatalf("Generate() error = %v, want ErrInvalidUsername", err)
	}
	if accounts.calls != 0 {
		t.Fatalf("account calls = %d, want 0", accounts.calls)
	}
}

func TestGenerateMapsMissingAccount(t *testing.T) {
	service := NewService(
		&fakeAccountReader{err: account.ErrNotFound},
		&fakeStore{},
		&fakeGenerator{},
	)

	_, err := service.Generate(context.Background(), GenerateRequest{GitHubUsername: "octocat"})
	if !errors.Is(err, ErrAccountNotFound) {
		t.Fatalf("Generate() error = %v, want ErrAccountNotFound", err)
	}
}

func TestGenerateMapsStorageFailureToDependencyUnavailable(t *testing.T) {
	service := NewService(
		&fakeAccountReader{source: testSource()},
		&fakeStore{findExistingErr: errors.New("database offline")},
		&fakeGenerator{},
	)

	_, err := service.Generate(context.Background(), GenerateRequest{GitHubUsername: "octocat"})
	if !errors.Is(err, ErrDependencyUnavailable) {
		t.Fatalf("Generate() error = %v, want ErrDependencyUnavailable", err)
	}
}

func TestValidGitHubUsername(t *testing.T) {
	for _, username := range []string{"a", "octocat", "github-user-123"} {
		if !ValidGitHubUsername(username) {
			t.Errorf("ValidGitHubUsername(%q) = false, want true", username)
		}
	}
	for _, username := range []string{"", "-octocat", "octocat-", "octo--cat", "name with space"} {
		if ValidGitHubUsername(username) {
			t.Errorf("ValidGitHubUsername(%q) = true, want false", username)
		}
	}
}
