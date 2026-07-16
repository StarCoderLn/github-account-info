# Go API

Go REST API for generating and serving personal introductions from GitHub account data already stored by the Node/tRPC application.

The Go service never receives a GitHub PAT and does not call GitHub to rediscover the username. Public and internal API contracts use `username`/`githubUsername`; only the repository maps that value to the existing GitHub-derived `login` database column. The first generator is a deterministic `template-v1` implementation.

## Development

```bash
export DATABASE_URL='postgresql://...'
export DB_SCHEMA='public'
export CORS_ORIGINS='http://localhost:3001'
export APP_ENV='development'
pnpm dev:go
curl http://localhost:8080/healthz
```

The local `DATABASE_URL` should point to a local PostgreSQL instance or the existing SSM tunnel. Do not commit it and do not pass credentials as command-line arguments.

Production containers default to `APP_ENV=production`. In production the service requires `RDS_CA_BUNDLE` and replaces any connection-string TLS preference with TLS 1.2+ certificate and hostname verification. The image contains the official AWS RDS `us-east-2` root bundle at `/etc/ssl/certs/rds-us-east-2-bundle.pem`.

## Container

The builder is pinned to the Docker Official Image `golang:1.26.5-alpine3.23` manifest digest. The runtime is `scratch` and contains only the statically linked Go binary and the RDS CA bundle; it runs as numeric UID/GID `65532`.

```bash
docker build --platform linux/amd64 -t github-account-info-go:local .
docker run --rm --env-file .env -p 8080:8080 github-account-info-go:local
```

For local PostgreSQL, set `APP_ENV=development` in the uncommitted `.env`; production TLS enforcement is intended for the real RDS hostname.

## API

Generate or reuse an introduction for an account that already exists in `github_account`:

```http
POST /internal/v1/introductions
Content-Type: application/json

{
  "githubUsername": "octocat",
  "regenerate": false
}
```

This internal write endpoint is intended for the Node Lambda over Cloud Map. It is not exposed by the public API Gateway routes.

Read an already-generated introduction:

```http
GET /api/v1/github-users/octocat/introduction
```

Health endpoints:

```http
GET /healthz
GET /readyz
```

## Commands

```bash
go test ./...
go vet ./...
go build -o dist/go-api ./cmd/api
```
