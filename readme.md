# Storagetron

## Run

```
docker compose up --build
```

## Usage

### Create item

```
curl -X POST localhost:8080/items \
  -H "Content-Type: application/json" \
  -d '{"name":"Laptop"}'
```

### List items

```
curl localhost:8080/items
```

### Get item

```
curl localhost:8080/items/{id}
```

### Delete item

```
curl -X DELETE localhost:8080/items/{id}
```

### Upload photo

```
curl -X POST localhost:8080/items/{id}/photos
```

### Scan

```
curl localhost:8080/scan/{code}
```

## Planned features

### Must

* mobile scanner UI
* PDF / CSV / XLS generator for item / container / location

### Good to have

* full-text search (Postgres tsvector)
* versioning (history of moves)
* ClickHouse for scan analytics
* label printer integration (NIIMBOT)
* custom grouping with tags

## HLD

```
     [ Web UI (Next.js / React / Whatever) ]
                       │
                       ▼
                   [ API (Go) ]
                       │
         ┌─────────────┴──────────┐
         ▼                        ▼
[ Postgres / Mysql ]        [ MinIO (S3) ]
     (metadata)             (photos/files)
```

### Points for HLD

* Postgres = source of truth
* MinIO = blob storage only
* API = all logic
* IDs are QR-friendly (UUID / shortid)
* Everything printable = queryable in one request

### Entities

* items -> physical objects
* containers -> boxes / kits
* locations -> rooms / shelves
* item_container -> many-to-many
* photos
* labels (QR/barcode values)
* custom_fields

### Storage logic

* Item - minimal entity
* Box - simple aggregation point
* Shelf / Wardrobe - bigger aggregation point
* Room - storage point
* City (maybe with address)
* Country