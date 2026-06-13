# Storagetron

Storagetron is a small home-inventory system for tracking physical things during a relocation like 
items, boxes (also named kits), storage locations, photos, QR labels, and backups

## Why?

Moving creates a deceptively hard data problem - the thing you need is usually in a box, 
that box is in a room, and the label you can scan is the only reliable lookup key. 
Storagetron keeps the metadata in Postgres, stores photos in S3-compatible object storage,
and exposes the same inventory through a web UI, QR scanner, and HTTP API

## Architecture

<img alt="Architecture" src="./docs/arch-1.png" width="1000"/>

Code for this image

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

- Track **items** with name, description, optional location, label code, photos, and creation timestamp
- Track **kits/containers** with their own labels, photos, locations, and assigned items
- Model **locations** with country, city, room, and shelf fields
- Resolve QR code scans by custom label code first, then by UUID fallback
- Upload item and kit photos through presigned S3 URLs
- Browse and operate inventory from a web ui
- Export item or kit data for label-printing workflows
- Create and manage backup targets, schedules, manual backup runs, restore runs, and retention policy
- Expose `/metrics` for Prometheus scraping

## Quick Start

Run the full stack:

```bash
docker compose --profile app --profile web up --build
```

Then open:

- Web UI: <http://localhost:3000>
- API: <http://localhost:8086>
- MinIO console: <http://localhost:9006> (`minio` / `minio123`)

If you only need Postgres and MinIO for local development, then use simple

```bash
docker compose up -d
```

To run the API with a local Prometheus scraper:

```bash
docker compose --profile app --profile metrics up --build
```

Then open Prometheus at <http://localhost:9090>

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
| `BACKUP_SECRET_KEY` | Secret used to encrypt backup target configuration. |
| `BACKUP_TEMP_DIR` | Optional temp directory for backup artifacts. |

The Docker Compose defaults are development-only and should be replaced before running anywhere with real data

## Usage

The API is available both at the root path and under `/api`. With Docker Compose, use host port `8086`.

### Create a location

```bash
curl -X POST http://localhost:8086/locations \
  -H "Content-Type: application/json" \
  -d '{"country":"Kazakhstan","city":"Almaty","room":"Living room","shelf":"Shelf A"}'
```

### Create an item

```bash
curl -X POST http://localhost:8086/items \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Laptop",
    "description": "Work laptop in black sleeve",
    "label_code": "ITEM-LAPTOP-001"
  }'
```

### List items

```bash
curl "http://localhost:8086/items?limit=25&offset=0"
```

### Create a kit/container

```bash
curl -X POST http://localhost:8086/containers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Box 07",
    "description": "Desk equipment",
    "label_code": "BOX-007"
  }'
```

### Add an item to a kit

```bash
curl -X POST http://localhost:8086/containers/{container_id}/items \
  -H "Content-Type: application/json" \
  -d '{"item_id":"{item_id}"}'
```

### Create a photo upload URL

```bash
curl -X POST http://localhost:8086/items/{item_id}/photos \
  -H "Content-Type: application/json" \
  -d '{"file_name":"laptop.jpg","content_type":"image/jpeg"}'
```

The response contains `upload_url`; upload the file to that URL with `PUT`

### Scan a label or UUID

```bash
curl http://localhost:8086/scan/ITEM-LAPTOP-001
curl http://localhost:8086/scan/{item_or_container_uuid}
```

### Create an SFTP backup target

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

### Run a backup manually

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

```bash
docker compose up db minio minio-setup

export DATABASE_URL="postgres://app:app@localhost:5432/app"
export S3_ENDPOINT="http://localhost:9005"
export S3_PUBLIC_ENDPOINT="http://localhost:9005"
export S3_BUCKET="inventory"
export S3_ACCESS_KEY="minio"
export S3_SECRET_KEY="minio123"
export BACKUP_SECRET_KEY="development-backup-secret-change-me"

go run ./cmd/api
```

Run tests:

```bash
go test ./...
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Build and lint:

```bash
cd frontend
npm run build
npm run lint
```

### Repository layout

```text
cmd/api                  API entry point and route wiring
internal/handler         HTTP handlers for inventory, photos, scans
internal/service         Business logic
internal/repository      Postgres repositories
internal/storage         S3/MinIO client
internal/backup          Backup scheduler, worker, storage, drivers
migrations               Database schema migrations
pkg/model                Shared API/domain models
frontend                 Next.js application
docs                     NIIMBOT printing screenshots
```

## Operations

- Postgres is the durable source of truth. Back up the database and object storage together so metadata and photos stay consistent
- Keep `BACKUP_SECRET_KEY` stable. Rotating it without a migration path will make existing encrypted backup target configuration unreadable
- Treat Docker Compose credentials as local development defaults only
- Scrape `/metrics` for API, runtime, Postgres pool, backup, and restore metrics
- Alert on failed backup or restore runs if this is used for irreplaceable data


## Future Improvements

- Add authentication and role-aware access control before exposing the service beyond a trusted LAN
- Add import/export flows for CSV/XLSX/PDF directly in the UI
- Add full-text search across item names, descriptions, locations, and kit membership
- Add item move/history audit trails
- Support additional backup drivers already represented in the API model: local, S3, and WebDAV
- Add end-to-end tests for scanner, photo upload, and backup workflows
- Add a `Makefile` or task runner for repeatable `test`, `lint`, and local bootstrap commands
- Add label-printer integration for direct NIIMBOT or similar printer workflows

## Printing instructions with NIIMBOT

### PC/MAC

You can print all needed labels in a batch with the official NIIMBOT app

1. Create the right batch. To do so, mark needed assets with the checkbox and click the button to export CSV/XLSX

<img alt="Choose assets" src="./docs/doc-1.png" width="1000"/>

2. Open the NIIMBOT app and click the "+" button to create a new label template

<img alt="Create new template" src="./docs/doc-2.png" width="1000"/>

3. Import the exported Excel file to NIIMBOT

<img alt="Choose Excel" src="./docs/doc-3.png" width="1000"/>

4. Choose the items to use in your template

<img alt="Choose items to print" src="./docs/doc-4.png" width="1000"/>

5. Configure the template

1 - The label with its actual size

2 - Data source with selected columns. You can enable or disable them here

3 - Preview carousel

4 - Single element settings. You can change display type here: QR, barcode, text, and so on

<img alt="Template settings" src="./docs/doc-5.png" width="1000"/>

6. Print it with the Print button
