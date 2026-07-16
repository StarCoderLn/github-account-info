package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/StarCoderLn/github-account-info/apps/go-api/internal/account"
	"github.com/StarCoderLn/github-account-info/apps/go-api/internal/appserver"
	"github.com/StarCoderLn/github-account-info/apps/go-api/internal/config"
	"github.com/StarCoderLn/github-account-info/apps/go-api/internal/httpapi"
	"github.com/StarCoderLn/github-account-info/apps/go-api/internal/introduction"
	appPostgres "github.com/StarCoderLn/github-account-info/apps/go-api/internal/postgres"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("invalid configuration", "error", err)
		os.Exit(1)
	}

	databaseCtx, cancelDatabase := context.WithTimeout(context.Background(), 10*time.Second)
	pool, err := appPostgres.Open(
		databaseCtx,
		cfg.DatabaseURL,
		cfg.DatabaseSchema,
		appPostgres.TLSOptions{
			VerifyFull:          cfg.Production(),
			RootCertificatePath: cfg.RDSCABundle,
		},
	)
	cancelDatabase()
	if err != nil {
		logger.Error("database initialization failed")
		os.Exit(1)
	}
	defer pool.Close()

	accountRepository := account.NewRepository(pool)
	introductionRepository := introduction.NewRepository(pool)
	introductionService := introduction.NewService(
		accountRepository,
		introductionRepository,
		introduction.TemplateGenerator{},
	)

	server := &http.Server{
		Addr: ":" + cfg.Port,
		Handler: httpapi.NewRouter(httpapi.Dependencies{
			Introductions:           introductionService,
			Readiness:               pool,
			Logger:                  logger,
			CORSOrigins:             cfg.CORSOrigins,
			CORSPreviewOriginSuffix: cfg.CORSPreviewOriginSuffix,
		}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	logger.Info("go api listening", "port", cfg.Port)
	if err := appserver.Run(ctx, server, cfg.ShutdownTimeout); err != nil {
		logger.Error("go api stopped with error", "error", err)
		os.Exit(1)
	}
	logger.Info("go api stopped")
}
