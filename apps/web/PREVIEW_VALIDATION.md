# Stage 10 preview validation A

This temporary pull-request file intentionally changes the `apps/web/` path so
Cloudflare Pages and the isolated preview CodeBuild pipeline can be verified.

- Validation lane: A
- Retry gate: resolved CodeBuild source version
- Retry gate: PR number prefix parsing
- Retry gate: CloudFormation YAML without aliases
- Retry gate: typed preview seed and route-safe retry
- Expected data boundary: the schema derived from this pull request number
- Production behavior: unchanged

The pull request will be closed without merging after deployment and cleanup
evidence has been collected.
