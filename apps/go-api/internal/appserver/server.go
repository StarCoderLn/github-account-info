package appserver

import (
	"context"
	"errors"
	"net/http"
	"time"
)

type HTTPServer interface {
	ListenAndServe() error
	Shutdown(ctx context.Context) error
}

func Run(ctx context.Context, server HTTPServer, shutdownTimeout time.Duration) error {
	serverErrors := make(chan error, 1)
	go func() {
		serverErrors <- server.ListenAndServe()
	}()

	select {
	case err := <-serverErrors:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			return err
		}

		err := <-serverErrors
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}
