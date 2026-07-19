// config 的单元测试通过 t.Setenv 为每个测试建立隔离环境变量。
// t.Setenv 会在测试结束后自动恢复原值，不污染其他测试或开发终端。
package config

import (
	"testing"
	"time"
)

// TestLoadDefaults 验证未配置的可选环境变量会使用安全默认值。
func TestLoadDefaults(t *testing.T) {
	// 空字符串模拟“未配置”，从而验证 Load 是否应用默认值。
	t.Setenv("PORT", "")
	t.Setenv("DATABASE_URL", "postgres://example.invalid/app")
	t.Setenv("DB_SCHEMA", "")
	t.Setenv("CORS_ORIGINS", "")
	t.Setenv("APP_ENV", "")
	t.Setenv("RDS_CA_BUNDLE", "")
	t.Setenv("CORS_PREVIEW_ORIGIN_SUFFIX", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	// Go 测试通常直接写 if 比较；标准库不内置 assert API。
	if cfg.Port != "8080" {
		t.Fatalf("Port = %q, want 8080", cfg.Port)
	}
	if cfg.ShutdownTimeout != 10*time.Second {
		t.Fatalf("ShutdownTimeout = %s, want 10s", cfg.ShutdownTimeout)
	}
	if cfg.DatabaseSchema != "public" {
		t.Fatalf("DatabaseSchema = %q, want public", cfg.DatabaseSchema)
	}
	if cfg.Environment != "development" || cfg.Production() {
		t.Fatalf("Environment = %q, want non-production development", cfg.Environment)
	}
	if len(cfg.CORSOrigins) != 1 || cfg.CORSOrigins[0] != "http://localhost:3001" {
		t.Fatalf("CORSOrigins = %#v, want local web origin", cfg.CORSOrigins)
	}
}

// TestLoadParsesPreviewOriginSuffix 同时覆盖合法后缀和通配符拒绝。
func TestLoadParsesPreviewOriginSuffix(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://example.invalid/app")
	t.Setenv("CORS_PREVIEW_ORIGIN_SUFFIX", ".github-account-info.pages.dev")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.CORSPreviewOriginSuffix != ".github-account-info.pages.dev" {
		t.Fatalf("CORSPreviewOriginSuffix = %q", cfg.CORSPreviewOriginSuffix)
	}

	t.Setenv("CORS_PREVIEW_ORIGIN_SUFFIX", "*.pages.dev")
	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want wildcard suffix rejection")
	}
}

// TestLoadProductionRequiresAbsoluteRDSCABundle 验证 production TLS 前置条件。
func TestLoadProductionRequiresAbsoluteRDSCABundle(t *testing.T) {
	// 同一测试按缺失 → 相对路径 → 合法绝对路径逐步覆盖安全边界。
	t.Setenv("DATABASE_URL", "postgres://example.invalid/app")
	t.Setenv("APP_ENV", "production")
	t.Setenv("RDS_CA_BUNDLE", "")

	// 用 _ 丢弃 Config，只断言此输入必须返回 error。
	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want missing RDS_CA_BUNDLE error")
	}

	t.Setenv("RDS_CA_BUNDLE", "relative/rds.pem")
	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want absolute RDS_CA_BUNDLE error")
	}

	t.Setenv("RDS_CA_BUNDLE", "/etc/ssl/certs/rds-us-east-2-bundle.pem")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if !cfg.Production() {
		t.Fatal("Production() = false, want true")
	}
}

// TestLoadRejectsUnknownEnvironment 验证 APP_ENV 使用白名单。
func TestLoadRejectsUnknownEnvironment(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://example.invalid/app")
	t.Setenv("APP_ENV", "staging-ish")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want invalid APP_ENV error")
	}
}

// TestLoadRejectsInvalidPort 验证端口必须是合法整数。
func TestLoadRejectsInvalidPort(t *testing.T) {
	t.Setenv("PORT", "not-a-port")
	t.Setenv("DATABASE_URL", "postgres://example.invalid/app")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want invalid PORT error")
	}
}

// TestLoadRequiresDatabaseURL 验证数据库连接串是必填配置。
func TestLoadRequiresDatabaseURL(t *testing.T) {
	t.Setenv("PORT", "8080")
	t.Setenv("DATABASE_URL", "")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want missing DATABASE_URL error")
	}
}

// TestLoadRejectsUnsafeDatabaseSchema 验证 schema 名不能携带 SQL 片段。
func TestLoadRejectsUnsafeDatabaseSchema(t *testing.T) {
	t.Setenv("PORT", "8080")
	t.Setenv("DATABASE_URL", "postgres://example.invalid/app")
	t.Setenv("DB_SCHEMA", "public; DROP SCHEMA public")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want invalid DB_SCHEMA error")
	}
}

// TestLoadParsesCORSOrigins 验证逗号解析、去空白和去重。
func TestLoadParsesCORSOrigins(t *testing.T) {
	// 输入包含重复 origin，期望输出保持顺序并完成去重。
	t.Setenv("PORT", "8080")
	t.Setenv("DATABASE_URL", "postgres://example.invalid/app")
	t.Setenv("CORS_ORIGINS", "https://example.com, https://preview.example.com,https://example.com")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if len(cfg.CORSOrigins) != 2 {
		t.Fatalf("CORSOrigins = %#v, want two unique origins", cfg.CORSOrigins)
	}
}
