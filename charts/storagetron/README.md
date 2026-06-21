# Storagetron Helm Chart

This chart deploys the Storagetron Go API, the Next.js inventory web app, and optional in-cluster Postgres and MinIO services based on the root `docker-compose.yml`.

## Install

Build and push the application images first, then set their repositories:

```sh
helm upgrade --install storagetron ./helm/storagetron \
  --set api.image.repository=registry.example.com/storagetron-api \
  --set api.image.tag=latest \
  --set web.image.repository=registry.example.com/storagetron-web \
  --set web.image.tag=latest
```

## Common values

- `api.image.*` and `web.image.*`: API and web container images.
- `api.databaseUrl`: external Postgres URL. Leave empty to use the bundled Postgres.
- `api.s3.endpoint`, `api.s3.publicEndpoint`, `api.s3.bucket`, `api.s3.accessKey`, `api.s3.secretKey`: external S3-compatible storage values. Leave empty to use bundled MinIO defaults.
- `web.nextPublicApiUrl`: browser-facing API URL for the Next.js app. Set this to your ingress or load balancer URL in real deployments.
- `postgresql.enabled`: set to `false` when using external Postgres.
- `minio.enabled`: set to `false` when using external S3.
- `ingress.enabled`: enable HTTP ingress for the web and API services.

For production, override all passwords and use externally managed secrets or a private values file.

Important: `NEXT_PUBLIC_API_URL` is used by browser-side code and is usually inlined when the web image is built. Build `inventory-web` with the same API URL you put in `web.nextPublicApiUrl`, or adjust the app to read runtime config.

Photo uploads use presigned S3 URLs, so `api.s3.publicEndpoint` must also be reachable from the user's browser. For local testing you can port-forward MinIO and set it to `http://localhost:9005`.
