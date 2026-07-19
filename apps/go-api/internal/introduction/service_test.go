// Service 测试用手写 fake 隔离账号 Repository、介绍 Store 和 Generator，
// 只验证业务编排，不需要真实 PostgreSQL。
package introduction

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/StarCoderLn/github-account-info/apps/go-api/internal/account"
)

// fake 中的 calls 字段是 spy：除了返回数据，还记录依赖是否被调用。
type fakeAccountReader struct {
	source account.Source
	err    error
	calls  int
}

// FindByUsername 返回预设账号，并记录调用次数。
func (f *fakeAccountReader) FindByUsername(_ context.Context, _ string) (account.Source, error) {
	f.calls++
	return f.source, f.err
}

// fakeStore 同时保存预设结果和调用参数，便于断言 Service 是否正确 Upsert。
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

// FindByAccountID 返回预设缓存记录。
func (f *fakeStore) FindByAccountID(_ context.Context, _ int32) (Record, error) {
	return f.existing, f.findExistingErr
}

// Upsert 捕获 Service 传入的内容、版本和 hash。
func (f *fakeStore) Upsert(_ context.Context, accountID int32, content, generatorVersion, sourceHash string, generatedAt time.Time) (Record, error) {
	// 指针接收者允许测试方法修改 fake 的计数器和捕获字段。
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

// FindPublicByUsername 返回预设公开视图。
func (f *fakeStore) FindPublicByUsername(_ context.Context, _ string) (Public, error) {
	return f.public, f.publicErr
}

// fakeGenerator 输出固定内容，并统计 Generate 调用次数以验证缓存行为。
type fakeGenerator struct {
	content string
	calls   int
}

// Version 返回当前 fake 对应的生成器版本。
func (f *fakeGenerator) Version() string { return TemplateV1 }

// Generate 返回固定内容并增加调用计数。
func (f *fakeGenerator) Generate(_ context.Context, _ Source) (string, error) {
	f.calls++
	return f.content, nil
}

// testSource 集中构造一份合法账号 fixture，避免各测试重复字段。
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

// TestGenerateCreatesIntroductionFromExistingAccount 验证首次生成和持久化流程。
func TestGenerateCreatesIntroductionFromExistingAccount(t *testing.T) {
	// Arrange：组装 fake；Act：调用 Generate；Assert：检查结果和协作次数。
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

// TestGenerateReusesCurrentIntroduction 验证资料和版本未变化时命中缓存。
func TestGenerateReusesCurrentIntroduction(t *testing.T) {
	// hash 与 generator version 均相同时，应直接读 Public，不调用生成器/Upsert。
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

// TestGenerateRegenerateBypassesCache 验证显式 regenerate 会绕过缓存。
func TestGenerateRegenerateBypassesCache(t *testing.T) {
	// Regenerate=true 是显式缓存旁路，即使 hash 未变化也必须重新生成。
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

// TestGenerateRejectsInvalidUsernameBeforeDatabaseRead 验证输入校验先于依赖调用。
func TestGenerateRejectsInvalidUsernameBeforeDatabaseRead(t *testing.T) {
	// 除了检查错误类型，还通过 calls==0 验证“先校验、后访问数据库”的顺序。
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

// TestGenerateMapsMissingAccount 验证账号层 NotFound 被转换成领域错误。
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

// TestGenerateMapsStorageFailureToDependencyUnavailable 验证存储故障错误映射。
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

// TestValidGitHubUsername 覆盖 GitHub username 的合法和非法边界。
func TestValidGitHubUsername(t *testing.T) {
	// 两组 table 分别覆盖合法和非法输入；Errorf 允许继续检查剩余 username。
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
