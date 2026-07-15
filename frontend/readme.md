# Inventory Web

## Install

```bash
npm install
```

## Run

```
npm run dev
```

The web UI calls the backend through the same-origin `/api` path. In Kubernetes,
route `/api` to the backend service and all other paths to this web service.

For local frontend development, Next.js rewrites `/api/*` to the backend. By
default it proxies to `http://localhost:8086`, matching the root
`docker-compose.yml` port mapping. Override it with:

```bash
API_PROXY_TARGET=http://localhost:8080 npm run dev
```

The photo optimizer also uses `API_PROXY_TARGET` at runtime through the local
`/api/photos/:photo_id/content` route. Kubernetes deployments must set it to an
API address reachable from the web pod; the Storagetron Helm chart does this
automatically with the release-specific API service name.

When running the web UI from Docker Compose, the image must be rebuilt after
changing `API_PROXY_TARGET` because Next.js includes rewrites during the build:

```bash
docker compose up --build web
```

## Mobile camera scanning

Mobile browsers require a secure context for camera access. The scanner works on
`localhost` during local development, but phones opening the app through a LAN
address such as `http://192.168.x.x:3000` will not show a camera permission
prompt. Serve the web UI over HTTPS for phone scanning.

## Build

```
npm run build
npm run start
```
