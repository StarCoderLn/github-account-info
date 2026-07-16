package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/StarCoderLn/github-account-info/apps/go-api/internal/postgres"
	"github.com/StarCoderLn/github-account-info/apps/go-api/internal/previewdb"
)

func main() {
	if err := run(); err != nil {
		slog.Error("preview database operation failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	if len(os.Args) < 2 {
		return errors.New("usage: preview-db <create|drop> --pr-number <number>")
	}
	operation := os.Args[1]
	flags := flag.NewFlagSet(operation, flag.ContinueOnError)
	prNumber := flags.Int("pr-number", 0, "GitHub pull request number")
	confirmation := flags.String("confirm-schema", "", "exact pr_<number> confirmation required for drop")
	if err := flags.Parse(os.Args[2:]); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return errors.New("unexpected positional arguments")
	}

	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		return errors.New("DATABASE_URL is required")
	}
	caBundle := strings.TrimSpace(os.Getenv("RDS_CA_BUNDLE"))
	if caBundle == "" || !filepath.IsAbs(caBundle) {
		return errors.New("RDS_CA_BUNDLE must be an absolute path")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	pool, err := postgres.Open(ctx, databaseURL, "public", postgres.TLSOptions{
		VerifyFull:          true,
		RootCertificatePath: caBundle,
	})
	if err != nil {
		return fmt.Errorf("connect to preview database: %w", err)
	}
	defer pool.Close()

	switch operation {
	case "create":
		if *confirmation != "" {
			return errors.New("--confirm-schema is only valid for drop")
		}
		if err := previewdb.Create(ctx, pool, *prNumber); err != nil {
			return err
		}
	case "drop":
		if err := previewdb.Drop(ctx, pool, *prNumber, *confirmation); err != nil {
			return err
		}
	default:
		return fmt.Errorf("unsupported operation %q", operation)
	}

	schema, _ := previewdb.SchemaName(*prNumber)
	slog.Info("preview database operation completed", "operation", operation, "schema", schema, "prNumber", *prNumber)
	return nil
}
