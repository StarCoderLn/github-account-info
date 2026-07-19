// postgres 测试直接调用未导出的 poolConfig，因此不建立真实数据库连接。
package postgres

import (
	"crypto/tls"
	"path/filepath"
	"testing"
)

// TestPoolConfigUsesQuotedSearchPathAndBoundedPool 验证 schema 引用和连接数上限。
func TestPoolConfigUsesQuotedSearchPathAndBoundedPool(t *testing.T) {
	// got := ... 是 if initializer 的常见断言写法，got 只在 if 内可见。
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

// TestPoolConfigQuotesUntrustedSchemaAsOneIdentifier 验证深层 SQL 注入防护。
func TestPoolConfigQuotesUntrustedSchemaAsOneIdentifier(t *testing.T) {
	// 即使上层校验失效，pgx 仍应把恶意字符串引用成“一个标识符”，而非执行 SQL。
	config, err := poolConfig("postgres://user:password@example.invalid/app", "public; DROP SCHEMA public", TLSOptions{})
	if err != nil {
		t.Fatalf("poolConfig() error = %v", err)
	}

	if got := config.ConnConfig.RuntimeParams["search_path"]; got != `"public; DROP SCHEMA public"` {
		t.Fatalf("search_path = %q, want one quoted identifier", got)
	}
}

// TestPoolConfigEnforcesVerifyFullWithRDSRoots 验证 production TLS 完整校验。
func TestPoolConfigEnforcesVerifyFullWithRDSRoots(t *testing.T) {
	// filepath.Abs 根据当前测试目录生成绝对路径，避免把开发者机器路径写死。
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

// TestPoolConfigRejectsMissingRDSCABundle 验证 CA 文件缺失时立即失败。
func TestPoolConfigRejectsMissingRDSCABundle(t *testing.T) {
	// 只测试配置构造阶段读取证书失败，无需访问 example.invalid。
	_, err := poolConfig(
		"postgres://user:password@database.example.invalid/app",
		"public",
		TLSOptions{VerifyFull: true, RootCertificatePath: "/missing/rds.pem"},
	)
	if err == nil {
		t.Fatal("poolConfig() error = nil, want missing CA bundle error")
	}
}
