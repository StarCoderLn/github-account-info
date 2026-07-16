package introduction

import (
	"context"
	"fmt"
	"strings"
)

type Generator interface {
	Version() string
	Generate(ctx context.Context, source Source) (string, error)
}

type TemplateGenerator struct{}

func (TemplateGenerator) Version() string {
	return TemplateV1
}

func (TemplateGenerator) Generate(ctx context.Context, source Source) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}

	displayName := source.GitHubUsername
	if value := text(source.Name); value != "" {
		displayName = value
	}

	paragraphs := []string{
		fmt.Sprintf("%s（@%s）是一位 GitHub 用户。", displayName, source.GitHubUsername),
	}
	if value := text(source.Bio); value != "" {
		paragraphs = append(paragraphs, "个人简介："+withTerminalPunctuation(value))
	}

	company := text(source.Company)
	location := text(source.Location)
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

func text(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

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
