# AGENTS.md

Guidance for coding agents and maintainers working in this repository.

## Project Overview

Storagetron is a self-hosted home inventory application for tracking physical items, boxes/kits, locations, photos, QR labels, backups, and restores.

The stack is:

- Go API using Chi for HTTP routing.
- Postgres for durable inventory and backup metadata.
- MinIO/S3-compatible object storage for photos and backup object data.
- Next.js frontend for inventory management, QR scanning, and label export flows.
- Backup scheduler and worker for target-driven backup/restore operations.
- Prometheus metrics exposed from the API at `/metrics`.

The API routes are registered at both the root path and under `/api`. Docker Compose exposes the API on `localhost:8086` and the web UI on `localhost:3000`.

## Repository Map

```text
cmd/api                  API entry point, dependency wiring, route registration
internal/config          Environment-based API configuration
internal/db              Postgres connection and migrations
internal/handler         Inventory, photo, scan, middleware HTTP handlers
internal/service         Business logic for inventory, locations, photos
internal/repository      Postgres repositories
internal/storage         S3/MinIO client
internal/backup          Backup service, scheduler, worker, archive, drivers
internal/metrics         Prometheus metrics registration
internal/version         Build/version metadata
pkg/model                Shared API/domain models
migrations               Forward-only SQL migrations
frontend                 Next.js app, UI components, frontend tests
deploy                   Deployment support files such as Prometheus config
docs                     Architecture and NIIMBOT label-printing screenshots
```

## Local Setup

Run the full stack:

```bash
docker compose --profile app --profile web up --build
```

Useful endpoints:

- Web UI: <http://localhost:3000>
- API: <http://localhost:8086>
- MinIO console: <http://localhost:9006> using `minio` / `minio123`
- Prometheus: <http://localhost:9090> when started with the `metrics` profile

Run only local dependencies for backend development:

```bash
docker compose up db minio minio-setup
```

Run the API locally:

```bash
export DATABASE_URL="postgres://app:app@localhost:5432/app"
export S3_ENDPOINT="http://localhost:9005"
export S3_PUBLIC_ENDPOINT="http://localhost:9005"
export S3_BUCKET="inventory"
export S3_ACCESS_KEY="minio"
export S3_SECRET_KEY="minio123"
export BACKUP_SECRET_KEY="development-backup-secret-change-me"

go run ./cmd/api
```

Run the frontend locally:

```bash
cd frontend
npm install
npm run dev
```

The frontend proxies `/api/*` to `http://localhost:8086` by default. Override with `API_PROXY_TARGET` when needed.

## Verification

Backend:

```bash
go test ./...
```

Frontend:

```bash
cd frontend
npm run test
npm run build
npm run lint
```

`npm run lint` uses the ESLint CLI with the Next.js preset.

Integration tests that require Postgres are skipped unless `TEST_DATABASE_URL` points to a disposable database. Do not point integration tests at a database with valuable data.

## Coding Guidance

- Preserve the current layered architecture. Handlers should validate/translate HTTP input, services should hold business behavior, repositories should own SQL, and storage/backup packages should isolate external systems.
- Keep SQL migrations forward-only and additive whenever possible. Do not rewrite existing migrations that may already have run for users.
- Keep API behavior available at both root routes and `/api` routes unless a change explicitly updates the frontend proxy and documentation.
- Treat Docker Compose credentials as local development defaults only.
- Do not commit real secrets, object-storage credentials, private keys, backup target credentials, or `.env` files.
- Keep `BACKUP_SECRET_KEY` stable for any environment with existing encrypted backup target configuration. Rotating it without a migration path makes stored secrets unreadable.
- Update `README.md`, `frontend/readme.md`, or this file when changing setup commands, API routes, environment variables, migrations, backup behavior, metrics, or frontend proxy behavior.
- Prefer focused tests near the changed behavior. Add or update handler/service/repository tests for backend behavior and frontend tests under `frontend/tests` for TypeScript utility/API behavior.

## Release Notes For Agents

- This project is intended for self-hosted trusted-network use today. Do not imply that public-internet deployment is safe until authentication and access control exist.
- Existing screenshots under `docs/` are part of the README label-printing workflow; keep their relative links working.
