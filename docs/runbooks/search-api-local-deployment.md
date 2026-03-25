# Search API Local Deployment and Perf Validation Runbook

## Goal

Start the local search sidecar in a production-like way that proves readiness, auth, and dependency health, then run the API and DB perf gates against a real loopback setup.

## Prerequisites

- PostgreSQL is reachable with the configured AssistSupport DB credentials.
- Redis is running when the rate-limit backend is not in-memory.
- A non-default API key is available.
- Python virtual environment is created in `search-api/venv`.

## Setup

```bash
cd search-api
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Recommended production-like startup

```bash
redis-server --daemonize yes
cp .env.example .env.production

set -a
source .env.production
set +a

python3 validate_runtime.py --check-backends
gunicorn --chdir search-api --bind 127.0.0.1:${ASSISTSUPPORT_API_PORT:-3000} wsgi:app
```

## Required environment expectations

- `ASSISTSUPPORT_API_KEY` must be set.
- `ASSISTSUPPORT_SEARCH_API_REQUIRE_AUTH` should remain enabled.
- `ASSISTSUPPORT_RATE_LIMIT_STORAGE_URI` should point to Redis for production-like mode.
- DB credentials must resolve to the intended Postgres instance.

## Health model

- `GET /health` is liveness only.
- `GET /ready` is the deploy/readiness gate.

## Smoke checks

From another shell:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
ENVIRONMENT=production ASSISTSUPPORT_API_KEY=test-key ASSISTSUPPORT_RATE_LIMIT_STORAGE_URI=redis://127.0.0.1:6379/0 python3 smoke_search_api.py
```

## Expected results

- `/health` returns JSON with status information even before full readiness.
- `/ready` returns HTTP 200 only when runtime config, DB, rate-limit backend, and live model checks are healthy.
- Authenticated `/search` requests succeed.
- Unauthenticated `/search` requests fail.

## Local perf validation setup

The repo's `perf:api` and `perf:db` gates are real loopback checks. They are only meaningful when a local sidecar and a reachable Postgres instance exist.

### 1. Start a temporary local Postgres instance

Recommended local path on macOS/Homebrew:

```bash
brew services start postgresql@16
```

Create a dedicated local database if you do not already have one:

```bash
createuser assistsupport_dev || true
createdb assistsupport_dev -O assistsupport_dev || true
```

### 2. Seed the minimum BM25 schema for `perf:db`

`perf:db` needs a reachable Postgres database with `pg_stat_statements` plus a small `kb_articles` table for the BM25 fallback query path.

```bash
psql -h 127.0.0.1 -U assistsupport_dev -d assistsupport_dev <<'SQL'
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

CREATE TABLE IF NOT EXISTS kb_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  fts_content tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_kb_articles_fts_content
  ON kb_articles
  USING GIN (fts_content);

INSERT INTO kb_articles (id, title, content, category, is_active)
VALUES
  ('vpn-1', 'VPN Access Policy', 'VPN access requires MFA and approved devices.', 'policy', TRUE),
  ('vpn-2', 'VPN Troubleshooting', 'Restart the approved VPN client and verify posture checks.', 'howto', TRUE)
ON CONFLICT (id) DO NOTHING;
SQL
```

### 3. Start a loopback sidecar for `perf:api`

From repo root:

```bash
cd search-api
source venv/bin/activate
set -a
source .env.production
set +a
gunicorn --bind 127.0.0.1:${ASSISTSUPPORT_API_PORT:-3000} wsgi:app
```

Keep that process running in one shell while you run the perf commands from another shell.

### 4. Run the perf gates

API perf:

```bash
BASE_URL=http://127.0.0.1:3000 AUTH_TOKEN="${ASSISTSUPPORT_API_KEY}" pnpm perf:api
```

DB perf, preferred path with explicit URL:

```bash
DATABASE_URL=postgresql://assistsupport_dev@127.0.0.1:5432/assistsupport_dev pnpm perf:db
```

DB perf, venv-backed fallback path:

```bash
ASSISTSUPPORT_DB_HOST=127.0.0.1 \
ASSISTSUPPORT_DB_PORT=5432 \
ASSISTSUPPORT_DB_USER=assistsupport_dev \
ASSISTSUPPORT_DB_NAME=assistsupport_dev \
pnpm perf:db
```

### 5. Shut temporary services back down

Stop the loopback sidecar with `Ctrl-C` in its shell.

If you started a temporary Homebrew Postgres service just for validation:

```bash
brew services stop postgresql@16
```

## Common failure patterns

- `/health` works but `/ready` is degraded:
  - check Postgres connectivity,
  - check Redis availability,
  - check embedding-model initialization.
- `perf:api` fails before sending traffic:
  - verify the loopback sidecar is actually listening on `127.0.0.1:3000`,
  - verify `AUTH_TOKEN` matches `ASSISTSUPPORT_API_KEY`,
  - verify `/ready` returns HTTP 200 before starting the perf run.
- `perf:db` fails immediately:
  - verify the local Postgres instance is reachable,
  - verify `pg_stat_statements` can be created,
  - verify the seeded `kb_articles` table exists in the target database.
- Repo-root import errors:
  - use `wsgi.py` as the entrypoint, not ad hoc module bootstrapping.
- Auth failures:
  - verify the bearer token stored in AssistSupport matches `ASSISTSUPPORT_API_KEY`.

## Completion criteria

- Runtime validation passes.
- `/ready` is healthy.
- Smoke check succeeds.
- AssistSupport desktop shows the search sidecar as ready, not just alive.
- `perf:api` passes against the loopback sidecar.
- `perf:db` passes against the reachable local Postgres instance.
