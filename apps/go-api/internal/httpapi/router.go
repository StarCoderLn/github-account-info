// Package httpapi 把 HTTP 请求解析、CORS、日志和错误映射连接到业务 Service。
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

// 4 << 10 是位移写法：4 * 2^10 = 4096 bytes，用于限制生成请求体大小。
const maxGenerateBodyBytes = 4 << 10

// defaultGenerationTimeout 是业务生成操作未显式配置时的默认上限。
const defaultGenerationTimeout = 5 * time.Second

// IntroductionService 是 HTTP 层需要的最小业务接口；具体 Service 和测试 fake
// 只要方法集合一致就会隐式实现它。
type IntroductionService interface {
	Generate(ctx context.Context, request introduction.GenerateRequest) (introduction.GenerateResult, error)
	GetPublic(ctx context.Context, username string) (introduction.Public, error)
}

// Pinger 抽象 readiness 所需的数据库 Ping 能力。
type Pinger interface {
	Ping(ctx context.Context) error
}

// Dependencies 集中声明 Router 的外部依赖和可配置项。
type Dependencies struct {
	Introductions           IntroductionService
	Readiness               Pinger
	Logger                  *slog.Logger
	CORSOrigins             []string
	CORSPreviewOriginSuffix string
	GenerationTimeout       time.Duration
}

// NewRouter 注册路由并按“业务 mux → CORS → request logger”顺序组合 middleware。
func NewRouter(deps Dependencies) http.Handler {
	if deps.Logger == nil {
		deps.Logger = slog.Default()
	}
	if deps.GenerationTimeout <= 0 {
		deps.GenerationTimeout = defaultGenerationTimeout
	}

	// Go 1.22+ ServeMux pattern 可同时声明 HTTP method 和路径参数。
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", healthHandler)
	mux.HandleFunc("GET /readyz", deps.readyHandler)
	mux.HandleFunc("POST /internal/v1/introductions", deps.generateHandler)
	mux.HandleFunc("GET /api/v1/github-users/{username}/introduction", deps.publicIntroductionHandler)

	// 函数调用由内向外求值：请求先进入 requestLogger，再进入 cors，最后到 mux。
	return requestLogger(deps.Logger, cors(deps.CORSOrigins, deps.CORSPreviewOriginSuffix, mux))
}

// healthHandler 只证明进程能响应，不检查数据库等外部依赖。
// 参数名 _ 表示请求对象在此函数中故意不使用。
func healthHandler(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// readyHandler 在 2 秒内 Ping 数据库，供 ALB/ECS 判断 Task 是否可接收业务流量。
func (deps Dependencies) readyHandler(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	if deps.Readiness == nil || deps.Readiness.Ping(ctx) != nil {
		writeAPIError(w, http.StatusServiceUnavailable, "not_ready", "service is not ready")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

// generateHandler 解析内部生成请求，并给整个生成流程设置超时。
func (deps Dependencies) generateHandler(w http.ResponseWriter, r *http.Request) {
	if deps.Introductions == nil {
		writeAPIError(w, http.StatusServiceUnavailable, "service_unavailable", "introduction service is unavailable")
		return
	}

	// MaxBytesReader 在读取阶段强制字节上限，避免攻击者发送超大 JSON 占用内存。
	r.Body = http.MaxBytesReader(w, r.Body, maxGenerateBodyBytes)
	decoder := json.NewDecoder(r.Body)
	// 拒绝模型中不存在的 JSON 字段，避免拼错字段名却静默成功。
	decoder.DisallowUnknownFields()

	// Decode 需要指针 &request，才能把解析结果写入这个结构体变量。
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

// publicIntroductionHandler 从 URL path parameter 读取 username 并返回公开介绍。
func (deps Dependencies) publicIntroductionHandler(w http.ResponseWriter, r *http.Request) {
	if deps.Introductions == nil {
		writeAPIError(w, http.StatusServiceUnavailable, "service_unavailable", "introduction service is unavailable")
		return
	}

	// r.Context() 会在客户端断开、Server 关闭或上游取消时传播信号到数据库层。
	result, err := deps.Introductions.GetPublic(r.Context(), r.PathValue("username"))
	if err != nil {
		deps.writeServiceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// writeServiceError 把领域错误稳定映射成 HTTP status 和公开错误码，
// 未知内部错误只写日志，不把数据库等敏感细节返回给客户端。
func (deps Dependencies) writeServiceError(w http.ResponseWriter, r *http.Request, err error) {
	// 不带表达式的 switch 按顺序选择第一个为 true 的 case。
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

// ensureJSONEOF 确保第一个 JSON 对象后只有空白，拒绝连续提交多个 JSON 值。
func ensureJSONEOF(decoder *json.Decoder) error {
	// any 可容纳任意 JSON 值；这里只判断是否存在，不关心具体内容。
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

// writeAPIError 统一生成 {"error": {...}} 结构。
func writeAPIError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]string{
			"code":    code,
			"message": message,
		},
	})
}

// writeJSON 设置响应头/状态码并把任意可编码值写成 JSON。
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// status/header 已经写出，编码失败时无法可靠改写响应；这里明确忽略尾部错误。
	_ = json.NewEncoder(w).Encode(value)
}

// cors 返回包装 next 的 middleware，只允许精确 origin 或受控 HTTPS preview 后缀。
func cors(origins []string, previewOriginSuffix string, next http.Handler) http.Handler {
	// 先把 slice 转成 set，使每个请求的精确 origin 查询为 O(1)。
	allowed := make(map[string]struct{}, len(origins))
	for _, origin := range origins {
		allowed[origin] = struct{}{}
	}

	// http.HandlerFunc 是适配器类型，使普通函数也能满足 http.Handler 接口。
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
		// middleware 完成前置处理后必须显式调用 next，才能继续后续 handler。
		next.ServeHTTP(w, r)
	})
}

// matchesHTTPSOriginSuffix 安全解析 origin，避免只做字符串后缀比较而放过
// evil-example.com 或带端口、路径的伪造 origin。
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

// statusWriter 通过嵌入 http.ResponseWriter 复用原有全部方法，只覆盖 WriteHeader
// 以记录最终 HTTP 状态码。这种匿名字段叫 struct embedding，不是继承。
type statusWriter struct {
	http.ResponseWriter
	status int
}

// WriteHeader 使用指针接收者，因为需要修改 w.status。
func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

// requestLogger 为每个请求补 request ID，并在响应结束后记录结构化访问日志。
func requestLogger(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := validRequestID(r.Header.Get("X-Request-ID"))
		if requestID == "" {
			requestID = newRequestID()
		}
		w.Header().Set("X-Request-ID", requestID)

		started := time.Now()
		// 默认 200，因为 handler 如果只调用 Write 而不调用 WriteHeader，net/http
		// 会隐式发送 200。
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

// validRequestID 只接受合理长度的调用方 request ID，避免日志字段无限膨胀。
func validRequestID(value string) string {
	value = strings.TrimSpace(value)
	if len(value) == 0 || len(value) > 128 {
		return ""
	}
	return value
}

// newRequestID 优先生成 128-bit 随机 ID；系统随机源失败时退化为 UTC 时间戳。
func newRequestID() string {
	buffer := make([]byte, 16)
	// rand.Read 返回实际字节数和 error；成功时它保证填满整个 buffer。
	if _, err := rand.Read(buffer); err != nil {
		return time.Now().UTC().Format("20060102150405.000000000")
	}
	return hex.EncodeToString(buffer)
}
