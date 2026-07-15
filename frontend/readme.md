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

For local frontend development, a runtime Next.js route proxies `/api/*` to the
backend. By default it uses `http://localhost:8086`, matching the root
`docker-compose.yml` port mapping. Override it with an API origin that does not
include an `/api` path:

```bash
API_PROXY_TARGET=http://localhost:8080 npm run dev
```

The proxy preserves the `/api` prefix and supports all API methods. The Next.js
photo optimizer uses the same route when fetching `/api/photos/:photo_id/content`.
Kubernetes deployments must set `API_PROXY_TARGET` to an API origin reachable
from the web pod; the Storagetron Helm chart does this automatically with the
release-specific API service name.

`API_PROXY_TARGET` is evaluated when the web server handles a request, so a
configuration change only requires restarting the web container or pod:

```bash
docker compose restart web
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
