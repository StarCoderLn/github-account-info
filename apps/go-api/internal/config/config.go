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

const (
	defaultPort                   = "8080"
	defaultShutdownTimeoutSeconds = 10
	defaultDatabaseSchema         = "public"
	defaultCORSOrigin             = "http://localhost:3001"
	defaultEnvironment            = "development"
)

var databaseSchemaPattern = regexp.MustCompile(`^(public|pr_[1-9][0-9]*)$`)

var validEnvironments = map[string]struct{}{
	"development": {},
	"production":  {},
	"test":        {},
}

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

func Load() (Config, error) {
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

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

func (c Config) Production() bool {
	return c.Environment == "production"
}

func parseCORSOrigins(raw string) ([]string, error) {
	if strings.TrimSpace(raw) == "" {
		raw = defaultCORSOrigin
	}

	parts := strings.Split(raw, ",")
	origins := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, part := range parts {
		origin := strings.TrimSpace(part)
		parsed, err := url.Parse(origin)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
			return nil, fmt.Errorf("CORS_ORIGINS contains invalid origin %q", origin)
		}
		if _, exists := seen[origin]; exists {
			continue
		}
		seen[origin] = struct{}{}
		origins = append(origins, origin)
	}
	return origins, nil
}
