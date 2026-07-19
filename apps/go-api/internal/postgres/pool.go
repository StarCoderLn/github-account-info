// Package postgres 集中管理 pgx PostgreSQL 连接池和 production TLS 配置。
package postgres

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TLSOptions 控制是否执行完整证书链和数据库主机名校验。
type TLSOptions struct {
	VerifyFull          bool
	RootCertificatePath string
}

// Open 创建连接池并立即 Ping 数据库，确保返回的 Pool 真的可用。
func Open(ctx context.Context, databaseURL, schema string, tlsOptions TLSOptions) (*pgxpool.Pool, error) {
	config, err := poolConfig(databaseURL, schema, tlsOptions)
	if err != nil {
		return nil, err
	}

	// *pgxpool.Pool 是并发安全的连接池指针，多个 HTTP 请求可共同使用。
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("create database pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		// 创建后 Ping 失败时要主动 Close，不能把半初始化资源泄漏给调用方。
		pool.Close()
		return nil, fmt.Errorf("connect to database: %w", err)
	}

	return pool, nil
}

// poolConfig 只构造配置、不发起网络连接，因此可以在单元测试中验证。
func poolConfig(databaseURL, schema string, tlsOptions TLSOptions) (*pgxpool.Config, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database configuration: %w", err)
	}

	config.MaxConns = 5
	config.MinConns = 0
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute
	config.HealthCheckPeriod = time.Minute
	// pgx.Identifier.Sanitize 将 schema 当作一个 PostgreSQL 标识符正确引用，
	// 而不是直接拼接用户字符串，避免 search_path 注入和大小写歧义。
	config.ConnConfig.RuntimeParams["search_path"] = pgx.Identifier{schema}.Sanitize()

	if tlsOptions.VerifyFull {
		roots, err := loadRootCertificates(tlsOptions.RootCertificatePath)
		if err != nil {
			return nil, err
		}
		// ServerName 同时启用证书主机名校验；仅设置 RootCAs 还不等于 verify-full。
		config.ConnConfig.TLSConfig = &tls.Config{
			MinVersion: tls.VersionTLS12,
			RootCAs:    roots,
			ServerName: config.ConnConfig.Host,
		}
		// 禁止 pgx 尝试无 TLS 或其他 fallback 地址，production 必须严格失败。
		config.ConnConfig.Fallbacks = nil
	}
	return config, nil
}

// loadRootCertificates 从 PEM bundle 构造 TLS 信任根集合。
func loadRootCertificates(path string) (*x509.CertPool, error) {
	pem, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read RDS CA bundle: %w", err)
	}

	// := 声明新变量；AppendCertsFromPEM 返回是否至少成功解析一张证书。
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(pem) {
		return nil, fmt.Errorf("RDS CA bundle contains no valid certificates")
	}
	return roots, nil
}
