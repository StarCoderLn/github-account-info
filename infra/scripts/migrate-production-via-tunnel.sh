#!/usr/bin/env bash

set -euo pipefail

# A DATABASE_URL contains credentials. Never allow shell tracing to echo it.
set +x

readonly LOCAL_PORT="${LOCAL_PORT:-15432}"
readonly EXPECTED_DATABASE="github_account_info"

for command_name in node pnpm; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command not found: ${command_name}" >&2
    exit 1
  fi
done

if command -v nc >/dev/null 2>&1 && ! nc -z 127.0.0.1 "${LOCAL_PORT}" >/dev/null 2>&1; then
  echo "No SSM database tunnel is listening on 127.0.0.1:${LOCAL_PORT}." >&2
  echo "Start the port-forwarding session in another terminal, then retry." >&2
  exit 1
fi

source_database_url=""
migration_database_url=""

cleanup() {
  unset source_database_url migration_database_url
}
trap cleanup EXIT INT TERM

read -r -s -p "Paste the production DATABASE_URL (input hidden): " source_database_url
printf '\n'

if [[ -z "${source_database_url}" ]]; then
  echo "DATABASE_URL cannot be empty." >&2
  exit 1
fi

migration_database_url="$(
  SOURCE_DATABASE_URL="${source_database_url}" \
    MIGRATION_LOCAL_PORT="${LOCAL_PORT}" \
    MIGRATION_EXPECTED_DATABASE="${EXPECTED_DATABASE}" \
    node --input-type=module -e '
      const raw = process.env.SOURCE_DATABASE_URL ?? "";
      let url;

      try {
        url = new URL(raw);
      } catch {
        console.error("DATABASE_URL is not a valid URL.");
        process.exit(1);
      }

      if (!["postgres:", "postgresql:"].includes(url.protocol)) {
        console.error("DATABASE_URL must use the postgres or postgresql protocol.");
        process.exit(1);
      }

      const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
      if (database !== process.env.MIGRATION_EXPECTED_DATABASE) {
        console.error(`Refusing migration: expected database ${process.env.MIGRATION_EXPECTED_DATABASE}.`);
        process.exit(1);
      }

      if (!url.username || !url.password) {
        console.error("DATABASE_URL must contain a username and password.");
        process.exit(1);
      }

      url.hostname = "127.0.0.1";
      url.port = process.env.MIGRATION_LOCAL_PORT ?? "15432";
      url.searchParams.set("sslmode", "require");
      // pg currently aliases require to verify-full unless libpq compatibility
      // is explicit. The SSM tunnel uses a localhost address that cannot match
      // the RDS certificate hostname, while TLS encryption is still required.
      url.searchParams.set("uselibpqcompat", "true");
      process.stdout.write(url.toString());
    '
)"

unset source_database_url

echo "Applying the repository-owned Drizzle migrations to ${EXPECTED_DATABASE} through port ${LOCAL_PORT}..."
DATABASE_URL="${migration_database_url}" pnpm --filter @github-account-info/db db:migrate
echo "Production Drizzle migrations completed."
