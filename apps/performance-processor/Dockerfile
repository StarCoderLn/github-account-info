FROM node:22-bookworm-slim AS build
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json packages/config/package.json
COPY packages/performance-schema/package.json packages/performance-schema/package.json
COPY apps/performance-processor/package.json apps/performance-processor/package.json
RUN corepack enable && pnpm install --frozen-lockfile --filter performance-processor...
COPY packages/config packages/config
COPY packages/performance-schema packages/performance-schema
COPY apps/go-api/certs/us-east-2-bundle.pem apps/go-api/certs/us-east-2-bundle.pem
COPY apps/performance-processor apps/performance-processor
RUN pnpm --filter performance-processor build

FROM gcr.io/distroless/nodejs22-debian12:nonroot
WORKDIR /app
COPY --from=build /workspace/apps/performance-processor/dist/index.mjs /app/index.mjs
COPY --from=build /workspace/apps/go-api/certs/us-east-2-bundle.pem /app/certs/rds-bundle.pem
CMD ["/app/index.mjs"]
