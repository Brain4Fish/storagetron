# Storagetron

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go&logoColor=white)](go.mod)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=nextdotjs)](frontend/package.json)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](docker-compose.yml)
[![Storage](https://img.shields.io/badge/storage-Postgres%20%2B%20S3--compatible-336791)](docker-compose.yml)

Storagetron is a self-hosted home inventory system for people who need to know where their physical things are. It is built for moves, storage rooms, boxes, kits, shelves, photos, QR labels, and the small-but-painful question: "Which box is that thing in?"

It pairs a Go API with a Next.js web UI, keeps durable metadata in Postgres, stores photos in S3-compatible object storage, supports QR-code scanning, exports label-printing data, and includes backup/restore workflows with Prometheus metrics.

## Why Storagetron?

Moving turns ordinary belongings into a search problem. The item you need is inside a box, the box is in a room, and the only reliable lookup key might be a small label you can scan from your phone. Storagetron keeps that map searchable and recoverable:

- Track items, kits, containers, locations, photos, and labels.
- Scan custom label codes or UUID-backed QR codes.
- Group items into boxes/kits and inherit location context.
- Export item or kit data for label-printing workflows.
- Back up Postgres metadata and object storage together.
- Scrape operational metrics from `/metrics`.

Storagetron is currently best suited for trusted LAN or self-hosted personal use. Add authentication and access control before exposing it to the public internet.

## Architecture

<img alt="Storagetron architecture" src="./docs/arch-1.png" width="1000"/>

```mermaid
flowchart TD
    User[Browser / mobile scanner] --> Web[Next.js web UI]
    Web -->|/api proxy| API[Go API]
    User -->|direct HTTP / QR scan| API

    API --> Repo[Repository layer]
    Repo --> PG[(Postgres)]
    API --> S3[(MinIO / S3)]

    API --> BackupScheduler[Backup scheduler]
    BackupScheduler --> BackupWorker[Backup worker]
    BackupWorker --> PG
    BackupWorker --> S3
    BackupWorker --> Target[SFTP backup target]

    API --> Metrics[Prometheus /metrics]
```

## Features

- Inventory records for items with names, descriptions, label codes, locations, photos, and timestamps.
- Kits and containers for boxes, grouped assets, moving batches, or storage bins.
- Structured locations with country, city, room, shelf, and display-friendly names.
- QR scan resolution by custom label code first, then UUID fallback.
- Photo uploads through presigned S3 URLs for item and kit images.
- Browser UI for scanning, browsing, creating, editing, and printing inventory labels.
- Export flows for CSV/XLSX label-printing workflows.
- Backup targets, schedules, manual backup runs, restore runs, and retention policy.
- Prometheus metrics for HTTP traffic, build info, Postgres pool stats, backups, and restores.

## Quick Start

Run the full stack with Docker Compose:

```bash
docker compose --profile app --profile web up --build
```

Open:

- Web UI: <http://localhost:3000>
- API: <http://localhost:8086>
- MinIO console: <http://localhost:9006> using `minio` / `minio123`

For local backend development dependencies only:

```bash
docker compose up -d
```

For the API plus Prometheus:

```bash
docker compose --profile app --profile metrics up --build
```

Open Prometheus at <http://localhost:9090>.

The Compose credentials are development defaults. Replace every secret before using Storagetron with real data.

## Use Cases

- Moving homes and tracking which box contains each item.
- Maintaining a home lab, tool room, workshop, or storage unit inventory.
- Labeling shelves, boxes, kits, and equipment with QR codes.
- Keeping photo evidence of stored objects and containers.
- Backing up an inventory database and related object storage as one recoverable unit.

## Configuration

The API requires these environment variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. |
| `S3_ENDPOINT` | Internal S3 endpoint used by the API. |
| `S3_PUBLIC_ENDPOINT` | Browser-reachable S3 endpoint used in presigned URLs. |
| `S3_BUCKET` | Bucket for photo objects. |
| `S3_ACCESS_KEY` | S3 access key. |
| `S3_SECRET_KEY` | S3 secret key. |
| `BACKUP_SECRET_KEY` | Secret used to encrypt backup target configuration. Keep it stable. |
| `BACKUP_TEMP_DIR` | Optional temp directory for backup artifacts. |

The web app proxies same-origin `/api/*` requests to the Go API. During local frontend development it defaults to `http://localhost:8086`. Override it with:

```bash
cd frontend
API_PROXY_TARGET=http://localhost:8080 npm run dev
```

Mobile camera scanning requires a secure context. It works on `localhost`, but phones opening the app through a LAN address usually need HTTPS before the browser will grant camera access.

## API Examples

The API is available at both the root path and under `/api`. With Docker Compose, use host port `8086`.

Create a location:

```bash
curl -X POST http://localhost:8086/locations \
  -H "Content-Type: application/json" \
  -d '{"country":"Kazakhstan","city":"Almaty","room":"Living room","shelf":"Shelf A"}'
```

Create an item:

```bash
curl -X POST http://localhost:8086/items \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Laptop",
    "description": "Work laptop in black sleeve",
    "label_code": "ITEM-LAPTOP-001"
  }'
```

List items:

```bash
curl "http://localhost:8086/items?limit=25&offset=0"
```

Create a kit/container:

```bash
curl -X POST http://localhost:8086/containers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Box 07",
    "description": "Desk equipment",
    "label_code": "BOX-007"
  }'
```

Add an item to a kit:

```bash
curl -X POST http://localhost:8086/containers/{container_id}/items \
  -H "Content-Type: application/json" \
  -d '{"item_id":"{item_id}"}'
```

Create a photo upload URL:

```bash
curl -X POST http://localhost:8086/items/{item_id}/photos \
  -H "Content-Type: application/json" \
  -d '{"file_name":"laptop.jpg","content_type":"image/jpeg"}'
```

The response contains `upload_url`; upload the file to that URL with `PUT`.

Scan a label or UUID:

```bash
curl http://localhost:8086/scan/ITEM-LAPTOP-001
curl http://localhost:8086/scan/{item_or_container_uuid}
```

Create an SFTP backup target:

```bash
curl -X POST http://localhost:8086/backup/targets \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Home NAS",
    "type": "sftp",
    "enabled": true,
    "configuration": {
      "host": "nas.local",
      "port": 22,
      "username": "backup",
      "password": "change-me",
      "path": "/backups/storagetron"
    }
  }'
```

Run a backup manually:

```bash
curl -X POST http://localhost:8086/backup/run \
  -H "Content-Type: application/json" \
  -d '{"target_id":"{target_id}"}'
```

Check recent runs:

```bash
curl "http://localhost:8086/backup/runs?limit=20"
```

## Development

### Backend

Start Postgres and MinIO:

```bash
docker compose up db minio minio-setup
```

Run the API:

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

Run backend tests:

```bash
go test ./...
```

Integration tests that touch Postgres are skipped unless `TEST_DATABASE_URL` points at a disposable database.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Build and test:

```bash
cd frontend
npm run test
npm run build
npm run lint
```

`npm run lint` uses `next lint`; availability can vary across Next.js versions.

### Repository Layout

```text
cmd/api                  API entry point and route wiring
internal/handler         HTTP handlers for inventory, photos, scans
internal/service         Business logic
internal/repository      Postgres repositories
internal/storage         S3/MinIO client
internal/backup          Backup scheduler, worker, storage, and target drivers
internal/metrics         Prometheus instrumentation
internal/config          Environment-based API configuration
migrations               Forward-only database schema migrations
pkg/model                Shared API/domain models
frontend                 Next.js application
deploy                   Deployment support files
docs                     Architecture and label-printing screenshots
```

## Operations

- Postgres is the durable source of truth for inventory metadata.
- Object storage contains item and kit photos. Back up the database and object storage together so metadata and photos stay consistent.
- Keep `BACKUP_SECRET_KEY` stable. Rotating it without a migration path will make existing encrypted backup target configuration unreadable.
- Treat Docker Compose credentials as local development defaults only.
- Scrape `/metrics` for API, runtime, Postgres pool, backup, and restore metrics.
- Alert on failed backup or restore runs if this is used for irreplaceable data.

## Screenshots / Label Printing

Storagetron can export selected items or kits for external label-printer software. The current workflow is tested with the official NIIMBOT app.

1. Select the assets to print and export CSV/XLSX data.

   <img alt="Choose assets" src="./docs/doc-1.png" width="1000"/>

2. Open the NIIMBOT app and create a new label template.

   <img alt="Create new template" src="./docs/doc-2.png" width="1000"/>

3. Import the exported Excel file.

   <img alt="Choose Excel" src="./docs/doc-3.png" width="1000"/>

4. Choose the fields to use in the template.

   <img alt="Choose items to print" src="./docs/doc-4.png" width="1000"/>

5. Configure the label layout, data source, preview carousel, and individual QR/barcode/text elements.

   <img alt="Template settings" src="./docs/doc-5.png" width="1000"/>

6. Print from the NIIMBOT app.

## Roadmap

- Authentication and role-aware access control.
- Import/export flows for CSV, XLSX, and PDF directly in the UI.
- Full-text search across item names, descriptions, locations, and kit membership.
- Item move/history audit trails.
- Additional backup drivers already represented in the API model: local, S3, and WebDAV.
- End-to-end tests for scanner, photo upload, and backup workflows.
- A Makefile or task runner for repeatable test, lint, and local bootstrap commands.
- Direct label-printer integrations for NIIMBOT or similar devices.

## Contributing

Contributions are welcome. For code changes, please keep the existing layered structure: HTTP handlers validate and translate requests, services hold business behavior, repositories own Postgres access, and storage/backup packages isolate external systems.

Before opening a pull request:

```bash
go test ./...
cd frontend
npm run test
npm run build
```

Also update documentation when changing API routes, configuration, migrations, backup behavior, or local-development commands.

## License

Storagetron is available under the [MIT License](LICENSE).
