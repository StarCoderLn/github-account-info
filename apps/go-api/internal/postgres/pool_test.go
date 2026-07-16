package postgres

import (
	"crypto/tls"
	"path/filepath"
	"testing"
)

func TestPoolConfigUsesQuotedSearchPathAndBoundedPool(t *testing.T) {
	config, err := poolConfig("postgres://user:password@example.invalid/app", "pr_123", TLSOptions{})
	if err != nil {
		t.Fatalf("poolConfig() error = %v", err)
	}

	if got := config.ConnConfig.RuntimeParams["search_path"]; got != `"pr_123"` {
		t.Fatalf("search_path = %q, want quoted pr_123", got)
	}
	if config.MaxConns != 5 {
		t.Fatalf("MaxConns = %d, want 5", config.MaxConns)
	}
}

func TestPoolConfigQuotesUntrustedSchemaAsOneIdentifier(t *testing.T) {
	config, err := poolConfig("postgres://user:password@example.invalid/app", "public; DROP SCHEMA public", TLSOptions{})
	if err != nil {
		t.Fatalf("poolConfig() error = %v", err)
	}

	if got := config.ConnConfig.RuntimeParams["search_path"]; got != `"public; DROP SCHEMA public"` {
		t.Fatalf("search_path = %q, want one quoted identifier", got)
	}
}

func TestPoolConfigEnforcesVerifyFullWithRDSRoots(t *testing.T) {
	caBundle, err := filepath.Abs(filepath.Join("..", "..", "certs", "us-east-2-bundle.pem"))
	if err != nil {
		t.Fatalf("resolve CA bundle path: %v", err)
	}

	config, err := poolConfig(
		"postgres://user:password@database.example.invalid/app?sslmode=disable",
		"public",
		TLSOptions{VerifyFull: true, RootCertificatePath: caBundle},
	)
	if err != nil {
		t.Fatalf("poolConfig() error = %v", err)
	}
	if config.ConnConfig.TLSConfig == nil {
		t.Fatal("TLSConfig = nil, want verify-full TLS")
	}
	if config.ConnConfig.TLSConfig.ServerName != "database.example.invalid" {
		t.Fatalf("ServerName = %q, want database hostname", config.ConnConfig.TLSConfig.ServerName)
	}
	if config.ConnConfig.TLSConfig.MinVersion != tls.VersionTLS12 {
		t.Fatalf("MinVersion = %d, want TLS 1.2", config.ConnConfig.TLSConfig.MinVersion)
	}
	if config.ConnConfig.TLSConfig.RootCAs == nil {
		t.Fatal("RootCAs = nil, want RDS root certificates")
	}
	if len(config.ConnConfig.Fallbacks) != 0 {
		t.Fatalf("Fallbacks = %d, want no plaintext fallback", len(config.ConnConfig.Fallbacks))
	}
}

func TestPoolConfigRejectsMissingRDSCABundle(t *testing.T) {
	_, err := poolConfig(
		"postgres://user:password@database.example.invalid/app",
		"public",
		TLSOptions{VerifyFull: true, RootCertificatePath: "/missing/rds.pem"},
	)
	if err == nil {
		t.Fatal("poolConfig() error = nil, want missing CA bundle error")
	}
}
