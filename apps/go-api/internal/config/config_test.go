package config

import (
	"testing"
	"time"
)

func TestLoadDefaults(t *testing.T) {
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

func TestLoadProductionRequiresAbsoluteRDSCABundle(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://example.invalid/app")
	t.Setenv("APP_ENV", "production")
	t.Setenv("RDS_CA_BUNDLE", "")

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

func TestLoadRejectsUnknownEnvironment(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://example.invalid/app")
	t.Setenv("APP_ENV", "staging-ish")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want invalid APP_ENV error")
	}
}

func TestLoadRejectsInvalidPort(t *testing.T) {
	t.Setenv("PORT", "not-a-port")
	t.Setenv("DATABASE_URL", "postgres://example.invalid/app")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want invalid PORT error")
	}
}

func TestLoadRequiresDatabaseURL(t *testing.T) {
	t.Setenv("PORT", "8080")
	t.Setenv("DATABASE_URL", "")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want missing DATABASE_URL error")
	}
}

func TestLoadRejectsUnsafeDatabaseSchema(t *testing.T) {
	t.Setenv("PORT", "8080")
	t.Setenv("DATABASE_URL", "postgres://example.invalid/app")
	t.Setenv("DB_SCHEMA", "public; DROP SCHEMA public")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want invalid DB_SCHEMA error")
	}
}

func TestLoadParsesCORSOrigins(t *testing.T) {
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
