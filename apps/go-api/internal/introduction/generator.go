// Package introduction 包含个人介绍的领域模型、生成器、Repository 和 Service。
package introduction

import (
	"context"
	"fmt"
	"strings"
)

// Generator 抽象“把账号事实变成介绍文本”的能力。
// Service 依赖接口，因此未来可替换成 AI Generator，而无需修改业务流程。
type Generator interface {
	Version() string
	Generate(ctx context.Context, source Source) (string, error)
}

// TemplateGenerator 是无状态空结构体；struct{} 不保存字段，创建成本极低。
type TemplateGenerator struct{}

// Version 返回生成算法版本。值接收者不命名，因为方法不需要访问实例字段。
func (TemplateGenerator) Version() string {
	return TemplateV1
}

// Generate 根据已有账号事实拼出稳定的中文介绍，不访问外部服务。
func (TemplateGenerator) Generate(ctx context.Context, source Source) (string, error) {
	// 即使当前生成逻辑很快，也要尊重上游 context 的取消/超时约定。
	if err := ctx.Err(); err != nil {
		return "", err
	}

	displayName := source.GitHubUsername
	// if initializer 让临时变量 value 只存在于 if/else 作用域内。
	if value := text(source.Name); value != "" {
		displayName = value
	}

	// slice 字面量先放必有段落，后续按资料是否存在 append 可选段落。
	paragraphs := []string{
		fmt.Sprintf("%s（@%s）是一位 GitHub 用户。", displayName, source.GitHubUsername),
	}
	if value := text(source.Bio); value != "" {
		paragraphs = append(paragraphs, "个人简介："+withTerminalPunctuation(value))
	}

	company := text(source.Company)
	location := text(source.Location)
	// 不带表达式的 switch 等价于 switch true，适合按多个布尔条件分支。
	switch {
	case company != "" && location != "":
		paragraphs = append(paragraphs, fmt.Sprintf("目前与 %s 有关联，所在地为 %s。", company, location))
	case company != "":
		paragraphs = append(paragraphs, fmt.Sprintf("目前与 %s 有关联。", company))
	case location != "":
		paragraphs = append(paragraphs, fmt.Sprintf("所在地为 %s。", location))
	}

	paragraphs = append(paragraphs, fmt.Sprintf(
		"在 GitHub 上公开了 %d 个仓库，拥有 %d 位关注者，并关注了 %d 位用户。",
		source.PublicRepos,
		source.Followers,
		source.Following,
	))

	return strings.Join(paragraphs, " "), nil
}

// text 把可空字符串指针规范化为去除首尾空白的普通字符串。
func text(value *string) string {
	if value == nil {
		return ""
	}
	// *value 是指针解引用：读取指针指向的实际 string。
	return strings.TrimSpace(*value)
}

// withTerminalPunctuation 确保文本只补一次句末标点。
func withTerminalPunctuation(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return value
	}
	for _, punctuation := range []string{"。", "！", "？", ".", "!", "?"} {
		if strings.HasSuffix(value, punctuation) {
			return value
		}
	}
	return value + "。"
}
