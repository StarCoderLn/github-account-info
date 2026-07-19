// Generator 测试关注最终文案是否使用正确事实，而不接触数据库或 HTTP 层。
package introduction

import (
	"context"
	"strings"
	"testing"
)

// TestTemplateGeneratorUsesExistingAccountFacts 验证可用账号事实会进入文案。
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

	// (TemplateGenerator{}) 是空结构体值；括号后可直接调用其值接收者方法。
	content, err := (TemplateGenerator{}).Generate(context.Background(), source)
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	// 循环断言多个关键片段，比绑定整段文案更能容忍无关措辞调整。
	for _, want := range []string{"小明（@xiaoming）", bio, company, location, "12 个仓库", "34 位关注者"} {
		if !strings.Contains(content, want) {
			t.Fatalf("content = %q, want to contain %q", content, want)
		}
	}
}

// TestTemplateGeneratorFallsBackToUsername 验证姓名缺失时使用 username。
func TestTemplateGeneratorFallsBackToUsername(t *testing.T) {
	content, err := (TemplateGenerator{}).Generate(context.Background(), Source{GitHubUsername: "octocat"})
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if !strings.Contains(content, "octocat（@octocat）") {
		t.Fatalf("content = %q, want username fallback", content)
	}
}

// TestTemplateGeneratorDoesNotDuplicateChinesePunctuation 验证句末标点不会重复。
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
