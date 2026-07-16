package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/StarCoderLn/github-account-info/apps/go-api/internal/introduction"
)

const maxGenerateBodyBytes = 4 << 10

const defaultGenerationTimeout = 5 * time.Second

type IntroductionService interface {
	Generate(ctx context.Context, request introduction.GenerateRequest) (introduction.GenerateResult, error)
	GetPublic(ctx context.Context, username string) (introduction.Public, error)
}

type Pinger interface {
	Ping(ctx context.Context) error
}

type Dependencies struct {
	Introductions           IntroductionService
	Readiness               Pinger
	Logger                  *slog.Logger
	CORSOrigins             []string
	CORSPreviewOriginSuffix string
	GenerationTimeout       time.Duration
}

func NewRouter(deps Dependencies) http.Handler {
	if deps.Logger == nil {
		deps.Logger = slog.Default()
	}
	if deps.GenerationTimeout <= 0 {
		deps.GenerationTimeout = defaultGenerationTimeout
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", healthHandler)
	mux.HandleFunc("GET /readyz", deps.readyHandler)
	mux.HandleFunc("POST /internal/v1/introductions", deps.generateHandler)
	mux.HandleFunc("GET /api/v1/github-users/{username}/introduction", deps.publicIntroductionHandler)

	return requestLogger(deps.Logger, cors(deps.CORSOrigins, deps.CORSPreviewOriginSuffix, mux))
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (deps Dependencies) readyHandler(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	if deps.Readiness == nil || deps.Readiness.Ping(ctx) != nil {
		writeAPIError(w, http.StatusServiceUnavailable, "not_ready", "service is not ready")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func (deps Dependencies) generateHandler(w http.ResponseWriter, r *http.Request) {
	if deps.Introductions == nil {
		writeAPIError(w, http.StatusServiceUnavailable, "service_unavailable", "introduction service is unavailable")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxGenerateBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	var request introduction.GenerateRequest
	if err := decoder.Decode(&request); err != nil {
		writeAPIError(w, http.StatusBadRequest, "invalid_request", "request body must be valid JSON")
		return
	}
	if err := ensureJSONEOF(decoder); err != nil {
		writeAPIError(w, http.StatusBadRequest, "invalid_request", "request body must contain one JSON object")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), deps.GenerationTimeout)
	defer cancel()
	result, err := deps.Introductions.Generate(ctx, request)
	if err != nil {
		deps.writeServiceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (deps Dependencies) publicIntroductionHandler(w http.ResponseWriter, r *http.Request) {
	if deps.Introductions == nil {
		writeAPIError(w, http.StatusServiceUnavailable, "service_unavailable", "introduction service is unavailable")
		return
	}

	result, err := deps.Introductions.GetPublic(r.Context(), r.PathValue("username"))
	if err != nil {
		deps.writeServiceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (deps Dependencies) writeServiceError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, introduction.ErrInvalidUsername):
		writeAPIError(w, http.StatusBadRequest, "invalid_username", "github username is invalid")
	case errors.Is(err, introduction.ErrAccountNotFound):
		writeAPIError(w, http.StatusNotFound, "github_account_not_found", "github account was not found")
	case errors.Is(err, introduction.ErrIntroductionNotFound):
		writeAPIError(w, http.StatusNotFound, "introduction_not_found", "introduction has not been generated")
	case errors.Is(err, introduction.ErrDependencyUnavailable), errors.Is(err, context.DeadlineExceeded):
		deps.Logger.ErrorContext(r.Context(), "introduction dependency unavailable", "error", err)
		writeAPIError(w, http.StatusServiceUnavailable, "service_unavailable", "introduction service is temporarily unavailable")
	default:
		deps.Logger.ErrorContext(r.Context(), "introduction request failed", "error", err)
		writeAPIError(w, http.StatusInternalServerError, "internal_error", "internal server error")
	}
}

func ensureJSONEOF(decoder *json.Decoder) error {
	var extra any
	err := decoder.Decode(&extra)
	if errors.Is(err, io.EOF) {
		return nil
	}
	if err == nil {
		return errors.New("multiple JSON values")
	}
	return err
}

func writeAPIError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]string{
			"code":    code,
			"message": message,
		},
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func cors(origins []string, previewOriginSuffix string, next http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(origins))
	for _, origin := range origins {
		allowed[origin] = struct{}{}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			next.ServeHTTP(w, r)
			return
		}
		_, exactOrigin := allowed[origin]
		if !exactOrigin && !matchesHTTPSOriginSuffix(origin, previewOriginSuffix) {
			if r.Method == http.MethodOptions {
				writeAPIError(w, http.StatusForbidden, "origin_not_allowed", "origin is not allowed")
				return
			}
			next.ServeHTTP(w, r)
			return
		}

		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Preview-Environment, X-Request-ID")
		w.Header().Add("Vary", "Origin")
		w.Header().Add("Vary", "Access-Control-Request-Headers")
		w.Header().Add("Vary", "Access-Control-Request-Method")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func matchesHTTPSOriginSuffix(origin, suffix string) bool {
	if suffix == "" {
		return false
	}
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Scheme != "https" || parsed.Port() != "" || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return false
	}
	hostname := strings.ToLower(parsed.Hostname())
	return len(hostname) > len(suffix) && strings.HasSuffix(hostname, suffix)
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func requestLogger(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := validRequestID(r.Header.Get("X-Request-ID"))
		if requestID == "" {
			requestID = newRequestID()
		}
		w.Header().Set("X-Request-ID", requestID)

		started := time.Now()
		wrapped := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(wrapped, r)
		logger.InfoContext(r.Context(), "http request",
			"requestId", requestID,
			"method", r.Method,
			"path", r.URL.Path,
			"status", wrapped.status,
			"durationMs", time.Since(started).Milliseconds(),
		)
	})
}

func validRequestID(value string) string {
	value = strings.TrimSpace(value)
	if len(value) == 0 || len(value) > 128 {
		return ""
	}
	return value
}

func newRequestID() string {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return time.Now().UTC().Format("20060102150405.000000000")
	}
	return hex.EncodeToString(buffer)
}
