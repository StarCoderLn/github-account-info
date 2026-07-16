# syntax=docker/dockerfile:1.7

ARG GO_IMAGE=golang:1.26.5-alpine3.23@sha256:622e56dbc11a8cfe87cafa2331e9a201877271cbff918af53d3be315f3da88cc

FROM --platform=$BUILDPLATFORM ${GO_IMAGE} AS dependencies
WORKDIR /src
ENV CGO_ENABLED=0 GOTOOLCHAIN=local

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download && go mod verify

FROM dependencies AS build
ARG TARGETOS=linux
ARG TARGETARCH

COPY cmd ./cmd
COPY internal ./internal
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -tags netgo,osusergo \
      -ldflags="-s -w -buildid=" \
      -o /out/go-api ./cmd/api && \
    GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -tags netgo,osusergo \
      -ldflags="-s -w -buildid=" \
      -o /out/preview-db ./cmd/preview-db

FROM scratch AS runtime

COPY --chown=65532:65532 certs/us-east-2-bundle.pem /etc/ssl/certs/rds-us-east-2-bundle.pem
COPY --from=build --chown=65532:65532 /out/go-api /go-api
COPY --from=build --chown=65532:65532 /out/preview-db /preview-db

ENV APP_ENV=production \
    PORT=8080 \
    RDS_CA_BUNDLE=/etc/ssl/certs/rds-us-east-2-bundle.pem

USER 65532:65532
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["/go-api"]
