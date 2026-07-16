package introduction

import (
	"context"
	"strings"
	"testing"
)

func TestTemplateGeneratorUsesExistingAccountFacts(t *testing.T) {
	name := "小明"
	bio := "喜欢构建可靠的软件"
	company := "Example Inc."
	location := "Shanghai"
	source := Source{
		GitHubUsername: "xiaoming",
		Name:           &name,
		Bio:            &bio,
		Company:        &company,
		Location:       &location,
		PublicRepos:    12,
		Followers:      34,
		Following:      5,
	}

	content, err := (TemplateGenerator{}).Generate(context.Background(), source)
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	for _, want := range []string{"小明（@xiaoming）", bio, company, location, "12 个仓库", "34 位关注者"} {
		if !strings.Contains(content, want) {
			t.Fatalf("content = %q, want to contain %q", content, want)
		}
	}
}

func TestTemplateGeneratorFallsBackToUsername(t *testing.T) {
	content, err := (TemplateGenerator{}).Generate(context.Background(), Source{GitHubUsername: "octocat"})
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if !strings.Contains(content, "octocat（@octocat）") {
		t.Fatalf("content = %q, want username fallback", content)
	}
}

func TestTemplateGeneratorDoesNotDuplicateChinesePunctuation(t *testing.T) {
	bio := "喜欢开源。"
	content, err := (TemplateGenerator{}).Generate(context.Background(), Source{
		GitHubUsername: "octocat",
		Bio:            &bio,
	})
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if strings.Contains(content, "开源。。") {
		t.Fatalf("content = %q, duplicated punctuation", content)
	}
}
