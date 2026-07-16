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

type TLSOptions struct {
	VerifyFull          bool
	RootCertificatePath string
}

func Open(ctx context.Context, databaseURL, schema string, tlsOptions TLSOptions) (*pgxpool.Pool, error) {
	config, err := poolConfig(databaseURL, schema, tlsOptions)
	if err != nil {
		return nil, err
	}

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("create database pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("connect to database: %w", err)
	}

	return pool, nil
}

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
	config.ConnConfig.RuntimeParams["search_path"] = pgx.Identifier{schema}.Sanitize()

	if tlsOptions.VerifyFull {
		roots, err := loadRootCertificates(tlsOptions.RootCertificatePath)
		if err != nil {
			return nil, err
		}
		config.ConnConfig.TLSConfig = &tls.Config{
			MinVersion: tls.VersionTLS12,
			RootCAs:    roots,
			ServerName: config.ConnConfig.Host,
		}
		config.ConnConfig.Fallbacks = nil
	}
	return config, nil
}

func loadRootCertificates(path string) (*x509.CertPool, error) {
	pem, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read RDS CA bundle: %w", err)
	}

	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(pem) {
		return nil, fmt.Errorf("RDS CA bundle contains no valid certificates")
	}
	return roots, nil
}
