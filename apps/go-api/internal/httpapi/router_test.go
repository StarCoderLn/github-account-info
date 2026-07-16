package httpapi

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/StarCoderLn/github-account-info/apps/go-api/internal/introduction"
)

type fakeIntroductionService struct {
	generateResult introduction.GenerateResult
	publicResult   introduction.Public
	err            error
}

func (f fakeIntroductionService) Generate(_ context.Context, _ introduction.GenerateRequest) (introduction.GenerateResult, error) {
	return f.generateResult, f.err
}

func (f fakeIntroductionService) GetPublic(_ context.Context, _ string) (introduction.Public, error) {
	return f.publicResult, f.err
}

type fakePinger struct{ err error }

func (f fakePinger) Ping(_ context.Context) error { return f.err }

type timeoutIntroductionService struct{}

func (timeoutIntroductionService) Generate(ctx context.Context, _ introduction.GenerateRequest) (introduction.GenerateResult, error) {
	<-ctx.Done()
	return introduction.GenerateResult{}, ctx.Err()
}

func (timeoutIntroductionService) GetPublic(_ context.Context, _ string) (introduction.Public, error) {
	return introduction.Public{}, nil
}

func testRouter(service fakeIntroductionService, pingErr error) http.Handler {
	return NewRouter(Dependencies{
		Introductions: service,
		Readiness:     fakePinger{err: pingErr},
		Logger:        slog.New(slog.NewTextHandler(io.Discard, nil)),
		CORSOrigins:   []string{"http://localhost:3001"},
	})
}

func TestHealth(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	response := httptest.NewRecorder()

	testRouter(fakeIntroductionService{}, nil).ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	if body := strings.TrimSpace(response.Body.String()); body != `{"status":"ok"}` {
		t.Fatalf("body = %q, want health response", body)
	}
}

func TestReadyReturnsUnavailableWhenPingFails(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	response := httptest.NewRecorder()

	testRouter(fakeIntroductionService{}, errors.New("database offline")).ServeHTTP(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}
}

func TestGenerateIntroduction(t *testing.T) {
	generatedAt := time.Date(2026, 7, 15, 10, 0, 0, 0, time.UTC)
	service := fakeIntroductionService{generateResult: introduction.GenerateResult{
		Generated: true,
		Introduction: introduction.Public{
			GitHubUsername:   "octocat",
			Introduction:     "Octocat introduction",
			GeneratorVersion: introduction.TemplateV1,
			GeneratedAt:      generatedAt,
			UpdatedAt:        generatedAt,
		},
	}}
	request := httptest.NewRequest(http.MethodPost, "/internal/v1/introductions", strings.NewReader(`{"githubUsername":"octocat"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	testRouter(service, nil).ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", response.Code, http.StatusOK, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"githubUsername":"octocat"`) {
		t.Fatalf("body = %q, want generated introduction", response.Body.String())
	}
}

func TestGenerateRejectsUnknownJSONField(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/internal/v1/introductions", strings.NewReader(`{"githubUsername":"octocat","token":"secret"}`))
	response := httptest.NewRecorder()

	testRouter(fakeIntroductionService{}, nil).ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusBadRequest)
	}
	if strings.Contains(response.Body.String(), "secret") {
		t.Fatal("error response leaked request value")
	}
}

func TestGenerateRejectsMultipleJSONObjects(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/internal/v1/introductions", strings.NewReader(`{"githubUsername":"octocat"}{"githubUsername":"other"}`))
	response := httptest.NewRecorder()

	testRouter(fakeIntroductionService{}, nil).ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusBadRequest)
	}
}

func TestGenerateTimeoutReturnsServiceUnavailable(t *testing.T) {
	router := NewRouter(Dependencies{
		Introductions:     timeoutIntroductionService{},
		Readiness:         fakePinger{},
		Logger:            slog.New(slog.NewTextHandler(io.Discard, nil)),
		GenerationTimeout: time.Millisecond,
	})
	request := httptest.NewRequest(http.MethodPost, "/internal/v1/introductions", strings.NewReader(`{"githubUsername":"octocat"}`))
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}
}

func TestPublicIntroductionNotFound(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/github-users/octocat/introduction", nil)
	response := httptest.NewRecorder()

	testRouter(fakeIntroductionService{err: introduction.ErrIntroductionNotFound}, nil).ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusNotFound)
	}
}

func TestPublicIntroductionSuccess(t *testing.T) {
	bio := "GitHub mascot"
	service := fakeIntroductionService{publicResult: introduction.Public{
		GitHubUsername:   "octocat",
		Bio:              &bio,
		Introduction:     "Octocat introduction",
		GeneratorVersion: introduction.TemplateV1,
	}}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/github-users/octocat/introduction", nil)
	response := httptest.NewRecorder()

	testRouter(service, nil).ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	if !strings.Contains(response.Body.String(), `"introduction":"Octocat introduction"`) {
		t.Fatalf("body = %q, want public introduction", response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"bio":"GitHub mascot"`) {
		t.Fatalf("body = %q, want public bio", response.Body.String())
	}
}

func TestPublicIntroductionInvalidUsername(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/github-users/not-valid/introduction", nil)
	response := httptest.NewRecorder()

	testRouter(fakeIntroductionService{err: introduction.ErrInvalidUsername}, nil).ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusBadRequest)
	}
}

func TestPublicIntroductionDependencyUnavailable(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/github-users/octocat/introduction", nil)
	response := httptest.NewRecorder()

	testRouter(fakeIntroductionService{err: introduction.ErrDependencyUnavailable}, nil).ServeHTTP(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}
	if strings.Contains(response.Body.String(), "database") {
		t.Fatal("response leaked dependency details")
	}
}

func TestPublicIntroductionUnexpectedError(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/github-users/octocat/introduction", nil)
	response := httptest.NewRecorder()

	testRouter(fakeIntroductionService{err: errors.New("unexpected internal detail")}, nil).ServeHTTP(response, request)

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusInternalServerError)
	}
	if strings.Contains(response.Body.String(), "unexpected internal detail") {
		t.Fatal("response leaked internal error")
	}
}

func TestCORSPreflight(t *testing.T) {
	request := httptest.NewRequest(http.MethodOptions, "/api/v1/github-users/octocat/introduction", nil)
	request.Header.Set("Origin", "http://localhost:3001")
	response := httptest.NewRecorder()

	testRouter(fakeIntroductionService{}, nil).ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusNoContent)
	}
	if response.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3001" {
		t.Fatal("missing CORS allow origin")
	}
}

func TestCORSAllowsOnlyHTTPSPreviewSubdomains(t *testing.T) {
	router := NewRouter(Dependencies{
		Introductions:           fakeIntroductionService{},
		Readiness:               fakePinger{},
		Logger:                  slog.New(slog.NewTextHandler(io.Discard, nil)),
		CORSOrigins:             []string{"https://github-account-info.pages.dev"},
		CORSPreviewOriginSuffix: ".github-account-info.pages.dev",
	})

	for _, test := range []struct {
		origin string
		want   int
	}{
		{origin: "https://feature.github-account-info.pages.dev", want: http.StatusNoContent},
		{origin: "http://feature.github-account-info.pages.dev", want: http.StatusForbidden},
		{origin: "https://github-account-info.pages.dev.evil.example", want: http.StatusForbidden},
		{origin: "https://github-account-info.pages.dev", want: http.StatusNoContent},
	} {
		request := httptest.NewRequest(http.MethodOptions, "/api/v1/github-users/preview-user/introduction", nil)
		request.Header.Set("Origin", test.origin)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != test.want {
			t.Errorf("origin %q status = %d, want %d", test.origin, response.Code, test.want)
		}
	}
}

func TestRequestIDIsReturned(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	request.Header.Set("X-Request-ID", "request-123")
	response := httptest.NewRecorder()

	testRouter(fakeIntroductionService{}, nil).ServeHTTP(response, request)

	if response.Header().Get("X-Request-ID") != "request-123" {
		t.Fatalf("X-Request-ID = %q, want request-123", response.Header().Get("X-Request-ID"))
	}
}
