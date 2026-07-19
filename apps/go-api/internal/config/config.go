// Package config 负责从环境变量读取、校验并整理 Go API 的运行配置。
// internal 目录表示该包只能被 apps/go-api 模块内部代码 import。
package config

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// const 是编译期常量；同类型相关常量通常集中写在一个 const 块中。
const (
	defaultPort                   = "8080"
	defaultShutdownTimeoutSeconds = 10
	defaultDatabaseSchema         = "public"
	defaultCORSOrigin             = "http://localhost:3001"
	defaultEnvironment            = "development"
)

// MustCompile 在包初始化时编译正则；表达式写错会立即 panic，适合固定源码常量。
var databaseSchemaPattern = regexp.MustCompile(`^(public|pr_[1-9][0-9]*)$`)

// map[string]struct{} 常被当作 Set 使用：只关心 key 是否存在，空 struct 不占数据空间。
var validEnvironments = map[string]struct{}{
	"development": {},
	"production":  {},
	"test":        {},
}

// Config 是经过完整校验的运行配置。调用方拿到 Config 后不需要重复解析环境变量。
type Config struct {
	Port                    string
	ShutdownTimeout         time.Duration
	DatabaseURL             string
	DatabaseSchema          string
	Environment             string
	RDSCABundle             string
	CORSOrigins             []string
	CORSPreviewOriginSuffix string
}

// Load 读取环境变量、应用默认值并执行边界校验。
// 返回 Config{} 表示对应类型的零值，配合非 nil error 告知调用方加载失败。
func Load() (Config, error) {
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

	// strconv.Atoi 把十进制字符串转换为 int；Go 不做字符串到数字的隐式转换。
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return Config{}, fmt.Errorf("PORT must be an integer between 1 and 65535")
	}

	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}

	databaseSchema := strings.TrimSpace(os.Getenv("DB_SCHEMA"))
	if databaseSchema == "" {
		databaseSchema = defaultDatabaseSchema
	}
	if !databaseSchemaPattern.MatchString(databaseSchema) {
		return Config{}, fmt.Errorf("DB_SCHEMA must be public or pr_<number>")
	}

	environment := strings.TrimSpace(os.Getenv("APP_ENV"))
	if environment == "" {
		environment = defaultEnvironment
	}
	// map 查询可返回 value, ok。这里只关心是否存在，所以用 _ 丢弃 value。
	if _, ok := validEnvironments[environment]; !ok {
		return Config{}, fmt.Errorf("APP_ENV must be development, production, or test")
	}

	rdsCABundle := strings.TrimSpace(os.Getenv("RDS_CA_BUNDLE"))
	if environment == "production" {
		if rdsCABundle == "" {
			return Config{}, fmt.Errorf("RDS_CA_BUNDLE is required in production")
		}
		if !filepath.IsAbs(rdsCABundle) {
			return Config{}, fmt.Errorf("RDS_CA_BUNDLE must be an absolute path")
		}
	}

	corsOrigins, err := parseCORSOrigins(os.Getenv("CORS_ORIGINS"))
	if err != nil {
		return Config{}, err
	}
	corsPreviewOriginSuffix, err := parseCORSPreviewOriginSuffix(os.Getenv("CORS_PREVIEW_ORIGIN_SUFFIX"))
	if err != nil {
		return Config{}, err
	}

	// 结构体字面量使用字段名赋值，比依赖字段顺序更安全、也更易读。
	return Config{
		Port:                    port,
		ShutdownTimeout:         defaultShutdownTimeoutSeconds * time.Second,
		DatabaseURL:             databaseURL,
		DatabaseSchema:          databaseSchema,
		Environment:             environment,
		RDSCABundle:             rdsCABundle,
		CORSOrigins:             corsOrigins,
		CORSPreviewOriginSuffix: corsPreviewOriginSuffix,
	}, nil
}

// parseCORSPreviewOriginSuffix 校验允许的 HTTPS preview DNS 后缀。
func parseCORSPreviewOriginSuffix(raw string) (string, error) {
	suffix := strings.ToLower(strings.TrimSpace(raw))
	if suffix == "" {
		return "", nil
	}
	if !strings.HasPrefix(suffix, ".") || strings.ContainsAny(suffix, "*/:@?#") {
		return "", fmt.Errorf("CORS_PREVIEW_ORIGIN_SUFFIX must be a lowercase DNS suffix beginning with a dot")
	}
	parsed, err := url.Parse("https://preview" + suffix)
	if err != nil || parsed.Hostname() != "preview"+suffix || parsed.Port() != "" {
		return "", fmt.Errorf("CORS_PREVIEW_ORIGIN_SUFFIX must be a lowercase DNS suffix beginning with a dot")
	}
	return suffix, nil
}

// Production 是定义在 Config 上的方法。值接收者 (c Config) 会复制一个小结构体值；
// 该方法只读字段，不需要使用指针接收者。
func (c Config) Production() bool {
	return c.Environment == "production"
}

// parseCORSOrigins 将逗号分隔的 origin 字符串解析为去重后的字符串切片。
// []string 是动态长度的 slice，不是固定长度数组。
func parseCORSOrigins(raw string) ([]string, error) {
	if strings.TrimSpace(raw) == "" {
		raw = defaultCORSOrigin
	}

	parts := strings.Split(raw, ",")
	// make 创建 slice：长度为 0、预留容量为 len(parts)，减少 append 时重新分配。
	origins := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, part := range parts {
		origin := strings.TrimSpace(part)
		parsed, err := url.Parse(origin)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
			return nil, fmt.Errorf("CORS_ORIGINS contains invalid origin %q", origin)
		}
		// map 的第二返回值表示 key 是否已存在，用它实现稳定去重。
		if _, exists := seen[origin]; exists {
			continue
		}
		seen[origin] = struct{}{}
		// append 可能返回新的底层数组，因此必须把返回值重新赋给 origins。
		origins = append(origins, origin)
	}
	return origins, nil
}
