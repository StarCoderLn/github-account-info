// httpapi 测试使用 net/http/httptest 在内存中构造请求和响应，
// 不监听真实端口，因此运行快速且不会依赖网络环境。
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

// fakeIntroductionService 通过预设返回值覆盖 Router 所关心的成功/失败分支。
type fakeIntroductionService struct {
	generateResult introduction.GenerateResult
	publicResult   introduction.Public
	err            error
}

// Generate 返回 fake 中预设的生成结果或错误。
func (f fakeIntroductionService) Generate(_ context.Context, _ introduction.GenerateRequest) (introduction.GenerateResult, error) {
	return f.generateResult, f.err
}

// GetPublic 返回 fake 中预设的公开结果或错误。
func (f fakeIntroductionService) GetPublic(_ context.Context, _ string) (introduction.Public, error) {
	return f.publicResult, f.err
}

// 单字段 struct 可写成一行；err 为 nil 表示 readiness Ping 成功。
type fakePinger struct{ err error }

// Ping 用一个预设 error 模拟数据库就绪或故障。
func (f fakePinger) Ping(_ context.Context) error { return f.err }

// timeoutIntroductionService 等待 ctx 取消，用于验证 generation timeout。
type timeoutIntroductionService struct{}

// Generate 阻塞到 context 超时，用于稳定复现超时分支。
func (timeoutIntroductionService) Generate(ctx context.Context, _ introduction.GenerateRequest) (introduction.GenerateResult, error) {
	// 从 Done channel 接收会阻塞，直到 Router 创建的 timeout context 到期。
	<-ctx.Done()
	return introduction.GenerateResult{}, ctx.Err()
}

// GetPublic 只是为了让 timeoutIntroductionService 满足完整接口。
func (timeoutIntroductionService) GetPublic(_ context.Context, _ string) (introduction.Public, error) {
	return introduction.Public{}, nil
}

// testRouter 是测试 helper，集中提供默认依赖，减少每个用例重复组装。
func testRouter(service fakeIntroductionService, pingErr error) http.Handler {
	return NewRouter(Dependencies{
		Introductions: service,
		Readiness:     fakePinger{err: pingErr},
		Logger:        slog.New(slog.NewTextHandler(io.Discard, nil)),
		CORSOrigins:   []string{"http://localhost:3001"},
	})
}

// TestHealth 验证 liveness 路由的状态码和 JSON。
func TestHealth(t *testing.T) {
	// NewRequest 创建 *http.Request，NewRecorder 实现 ResponseWriter 并保存结果。
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	response := httptest.NewRecorder()

	// 直接调用 ServeHTTP 即可完整经过 middleware 和路由，无需启动 Server。
	testRouter(fakeIntroductionService{}, nil).ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	// if initializer 中的 body 只在该 if 内有效，避免临时变量泄漏到后续断言。
	if body := strings.TrimSpace(response.Body.String()); body != `{"status":"ok"}` {
		t.Fatalf("body = %q, want health response", body)
	}
}

// TestReadyReturnsUnavailableWhenPingFails 验证数据库失败会让 readiness 返回 503。
func TestReadyReturnsUnavailableWhenPingFails(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	response := httptest.NewRecorder()

	testRouter(fakeIntroductionService{}, errors.New("database offline")).ServeHTTP(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}
}

// TestGenerateIntroduction 验证内部生成接口的成功 JSON。
func TestGenerateIntroduction(t *testing.T) {
	// time.Date 构造固定时间，使 JSON 结果不依赖测试执行时刻。
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

// TestGenerateRejectsUnknownJSONField 验证严格 JSON schema 和敏感值不回显。
func TestGenerateRejectsUnknownJSONField(t *testing.T) {
	// 除了断言 400，还断言敏感请求值不会被错误响应回显。
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

// TestGenerateRejectsMultipleJSONObjects 验证请求体只能包含一个 JSON 值。
func TestGenerateRejectsMultipleJSONObjects(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/internal/v1/introductions", strings.NewReader(`{"githubUsername":"octocat"}{"githubUsername":"other"}`))
	response := httptest.NewRecorder()

	testRouter(fakeIntroductionService{}, nil).ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusBadRequest)
	}
}

// TestGenerateTimeoutReturnsServiceUnavailable 验证业务超时映射为 503。
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

// TestPublicIntroductionNotFound 验证未生成介绍映射为 404。
func TestPublicIntroductionNotFound(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/github-users/octocat/introduction", nil)
	response := httptest.NewRecorder()

	testRouter(fakeIntroductionService{err: introduction.ErrIntroductionNotFound}, nil).ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusNotFound)
	}
}

// TestPublicIntroductionSuccess 验证公开介绍及可空字段的 JSON。
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

// TestPublicIntroductionInvalidUsername 验证非法 path 参数映射为 400。
func TestPublicIntroductionInvalidUsername(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/github-users/not-valid/introduction", nil)
	response := httptest.NewRecorder()

	testRouter(fakeIntroductionService{err: introduction.ErrInvalidUsername}, nil).ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusBadRequest)
	}
}

// TestPublicIntroductionDependencyUnavailable 验证依赖故障映射为 503 且不泄密。
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

// TestPublicIntroductionUnexpectedError 验证未知错误映射为安全的 500 响应。
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

// TestCORSPreflight 验证精确 origin 的 OPTIONS 响应头。
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

// TestCORSAllowsOnlyHTTPSPreviewSubdomains 验证 preview origin 的协议和主机边界。
func TestCORSAllowsOnlyHTTPSPreviewSubdomains(t *testing.T) {
	router := NewRouter(Dependencies{
		Introductions:           fakeIntroductionService{},
		Readiness:               fakePinger{},
		Logger:                  slog.New(slog.NewTextHandler(io.Discard, nil)),
		CORSOrigins:             []string{"https://github-account-info.pages.dev"},
		CORSPreviewOriginSuffix: ".github-account-info.pages.dev",
	})

	// 这是 table-driven test：用匿名 struct slice 描述输入/期望，再循环执行。
	// 新增边界用例只需增加一行数据，不必复制整个 Arrange/Act/Assert。
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
			// t.Errorf 记录失败但继续其他表格用例；Fatalf 则会立刻停止当前测试。
			t.Errorf("origin %q status = %d, want %d", test.origin, response.Code, test.want)
		}
	}
}

// TestRequestIDIsReturned 验证调用方 request ID 会进入响应头。
func TestRequestIDIsReturned(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	request.Header.Set("X-Request-ID", "request-123")
	response := httptest.NewRecorder()

	testRouter(fakeIntroductionService{}, nil).ServeHTTP(response, request)

	if response.Header().Get("X-Request-ID") != "request-123" {
		t.Fatalf("X-Request-ID = %q, want request-123", response.Header().Get("X-Request-ID"))
	}
}
