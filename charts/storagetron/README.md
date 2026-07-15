# Storagetron Helm Chart

This chart deploys Storagetron: the Go API, the Next.js web UI, and optional in-cluster Postgres and MinIO services.

Storagetron is currently intended for trusted self-hosted environments. The chart can expose services through ingress, but the application does not yet provide authentication or authorization. Do not place it on the public internet without adding an external access-control layer.

## Quick Demo Install

Build and push the API and web images, then install with the demo values:

```sh
helm upgrade --install storagetron charts/storagetron \
  --namespace storagetron \
  --create-namespace \
  -f charts/storagetron/values-demo.yaml \
  --set api.image.repository=registry.example.com/storagetron-api \
  --set web.image.repository=registry.example.com/storagetron-web
```

The demo path enables bundled Postgres and MinIO. It is useful for local clusters and evaluation, but it stores demo credentials in Helm values.

If ingress is disabled, port-forward the web service:

```sh
kubectl -n storagetron port-forward svc/storagetron-web 3000:3000
```

Then open <http://localhost:3000>.

## Production-Style Install

Production deployments should usually provide external Postgres, external S3-compatible storage, and a Secret created outside Helm.

Create the Secret:

```sh
kubectl -n storagetron create secret generic storagetron-secrets \
  --from-literal=DATABASE_URL='postgres://user:password@postgres.example.com:5432/storagetron?sslmode=require' \
  --from-literal=S3_ACCESS_KEY='...' \
  --from-literal=S3_SECRET_KEY='...' \
  --from-literal=BACKUP_SECRET_KEY='a-long-stable-random-secret'
```

Install with bundled dependencies disabled:

```sh
helm upgrade --install storagetron charts/storagetron \
  --namespace storagetron \
  --create-namespace \
  -f charts/storagetron/values-production.yaml
```

`BACKUP_SECRET_KEY` encrypts stored backup target configuration. Keep it stable for any environment with existing backup targets.

## Ingress

Ingress paths commonly target `web`, `api`, or `minio`. Ports default to `web.service.port`, `api.service.port`, or `minio.service.apiPort`. Other service suffixes are allowed when `port` is set explicitly.

```yaml
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: storagetron.example.com
      paths:
        - path: /
          pathType: Prefix
          service: web
    - host: api.storagetron.example.com
      paths:
        - path: /
          pathType: Prefix
          service: api
```

The web app uses `web.nextPublicApiUrl` for browser-side API calls. Set it to the API URL users can reach through ingress or a load balancer.

## S3 And Photo Uploads

Storagetron uploads photos through presigned S3 URLs. `api.s3.endpoint` must be reachable by the API pod, and `api.s3.publicEndpoint` must be reachable by the user's browser for uploads. Displayed photos use stable same-origin `/api/photos/{photo_id}/content` URLs so the browser and Next.js image optimizer can cache them. When using bundled MinIO without ingress, browser uploads generally require port-forwarding or another route to MinIO.

For the bundled MinIO setup job, `minio.setup.corsAllowedOrigins` controls the CORS origins configured on MinIO. The default `*` is demo-friendly; use specific origins for real deployments.

## Secrets

Production installs should set `secret.existingSecret` and provide these keys:

| Key | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string for the API. |
| `S3_ACCESS_KEY` | S3-compatible storage access key. |
| `S3_SECRET_KEY` | S3-compatible storage secret key. |
| `BACKUP_SECRET_KEY` | Stable secret used to encrypt backup target configuration. |

When bundled Postgres or MinIO are enabled with `secret.existingSecret`, the same Secret must also include the configured bundled dependency keys:

| Key | Purpose |
| --- | --- |
| `POSTGRES_USER` | Bundled Postgres username. |
| `POSTGRES_PASSWORD` | Bundled Postgres password. |
| `POSTGRES_DB` | Bundled Postgres database name. |
| `MINIO_ROOT_USER` | Bundled MinIO root user. |
| `MINIO_ROOT_PASSWORD` | Bundled MinIO root password. |

All key names can be changed under `secret.keys`.

## Values Reference

| Value | Default | Description |
| --- | --- | --- |
| `nameOverride` | `""` | Override chart name in resource names. |
| `fullnameOverride` | `""` | Override full release name in resource names. |
| `imagePullSecrets` | `[]` | Pull secrets shared by all workloads. |
| `secret.existingSecret` | `""` | Existing Secret name. Preferred for production. |
| `secret.keys.*` | standard env names | Secret key names consumed by workloads. |
| `api.replicaCount` | `1` | API replicas when autoscaling is disabled. |
| `api.image.repository` | `storagetron-api` | API image repository. |
| `api.image.tag` | `latest` | API image tag. Prefer immutable tags in production. |
| `api.image.pullPolicy` | `IfNotPresent` | API image pull policy. |
| `api.imagePullSecrets` | `[]` | API-specific image pull secrets. |
| `api.service.type` | `ClusterIP` | API service type. |
| `api.service.port` | `8080` | API service port. |
| `api.databaseUrl` | `""` | Inline Postgres URL used only when no existing Secret is set. |
| `api.backup.key` | demo value | Inline backup secret used only when no existing Secret is set. |
| `api.s3.endpoint` | bundled MinIO URL | API-facing S3 endpoint. Required when `minio.enabled=false`. |
| `api.s3.publicEndpoint` | bundled MinIO URL | Browser-facing S3 endpoint for presigned uploads. |
| `api.s3.bucket` | `inventory` | S3 bucket for photos and backup objects. |
| `api.s3.accessKey` | bundled MinIO user | Inline S3 access key used only when no existing Secret is set. |
| `api.s3.secretKey` | bundled MinIO password | Inline S3 secret key used only when no existing Secret is set. |
| `api.podAnnotations`, `api.podLabels` | `{}` | Extra API pod metadata. |
| `api.podSecurityContext` | `{}` | API pod security context. |
| `api.securityContext` | non-root, read-only | API container security context. |
| `api.resources` | `{}` | API resource requests and limits. |
| `api.nodeSelector`, `api.tolerations`, `api.affinity` | empty | API scheduling controls. |
| `api.topologySpreadConstraints` | `[]` | API topology spread constraints. |
| `api.priorityClassName` | `""` | API priority class. |
| `api.env` | `{}` | Simple API env var map. |
| `api.extraEnv`, `api.extraEnvFrom` | `[]` | Additional API env entries and envFrom sources. |
| `api.extraVolumes`, `api.extraVolumeMounts` | writable `/tmp` | API volumes and mounts. Keep a writable temp path when using a read-only root filesystem. |
| `api.livenessProbe`, `api.readinessProbe`, `api.startupProbe` | see `values.yaml` | API probes. |
| `api.autoscaling.*` | disabled | Optional API HorizontalPodAutoscaler. |
| `api.podDisruptionBudget.*` | disabled | Optional API PodDisruptionBudget. |
| `web.replicaCount` | `1` | Web replicas when autoscaling is disabled. |
| `web.image.repository` | `storagetron-web` | Web image repository. |
| `web.image.tag` | `latest` | Web image tag. Prefer immutable tags in production. |
| `web.image.pullPolicy` | `IfNotPresent` | Web image pull policy. |
| `web.imagePullSecrets` | `[]` | Web-specific image pull secrets. |
| `web.service.type` | `ClusterIP` | Web service type. |
| `web.service.port` | `3000` | Web service port. |
| `web.nextPublicApiUrl` | internal API service URL | Browser-facing API URL. |
| `web.podAnnotations`, `web.podLabels` | `{}` | Extra web pod metadata. |
| `web.podSecurityContext` | `{}` | Web pod security context. |
| `web.securityContext` | non-root | Web container security context. |
| `web.resources` | `{}` | Web resource requests and limits. |
| `web.nodeSelector`, `web.tolerations`, `web.affinity` | empty | Web scheduling controls. |
| `web.topologySpreadConstraints` | `[]` | Web topology spread constraints. |
| `web.priorityClassName` | `""` | Web priority class. |
| `web.env` | `{}` | Simple web env var map. |
| `web.extraEnv`, `web.extraEnvFrom` | `[]` | Additional web env entries and envFrom sources. |
| `web.extraVolumes`, `web.extraVolumeMounts` | `[]` | Additional web volumes and mounts. |
| `web.livenessProbe`, `web.readinessProbe`, `web.startupProbe` | see `values.yaml` | Web probes. |
| `web.autoscaling.*` | disabled | Optional web HorizontalPodAutoscaler. |
| `web.podDisruptionBudget.*` | disabled | Optional web PodDisruptionBudget. |
| `postgresql.enabled` | `true` | Deploy bundled Postgres. Prefer external Postgres for production. |
| `postgresql.image.*` | `postgres:15` | Bundled Postgres image settings. |
| `postgresql.auth.*` | demo values | Bundled Postgres credentials when no existing Secret is set. |
| `postgresql.service.port` | `5432` | Bundled Postgres service port. |
| `postgresql.persistence.*` | enabled, `8Gi` | Bundled Postgres persistence. |
| `postgresql.*SecurityContext` | see `values.yaml` | Bundled Postgres security contexts. |
| `postgresql.resources` | `{}` | Bundled Postgres resources. |
| `postgresql.nodeSelector`, `postgresql.tolerations`, `postgresql.affinity` | empty | Bundled Postgres scheduling controls. |
| `postgresql.extraEnv`, `postgresql.extraEnvFrom` | `[]` | Additional bundled Postgres env settings. |
| `postgresql.extraVolumes`, `postgresql.extraVolumeMounts` | `[]` | Additional bundled Postgres volumes and mounts. |
| `postgresql.livenessProbe`, `postgresql.readinessProbe`, `postgresql.startupProbe` | see `values.yaml` | Bundled Postgres probes. |
| `minio.enabled` | `true` | Deploy bundled MinIO. Prefer external S3-compatible storage for production. |
| `minio.image.*` | `minio/minio:latest` | Bundled MinIO image settings. |
| `minio.mcImage.*` | `minio/mc:latest` | MinIO client image for setup job. |
| `minio.auth.*` | demo values | Bundled MinIO credentials when no existing Secret is set. |
| `minio.bucket` | `inventory` | Bucket created by the setup job. |
| `minio.service.*` | ClusterIP, `9000`, `9001` | Bundled MinIO service settings. |
| `minio.persistence.*` | enabled, `10Gi` | Bundled MinIO persistence. |
| `minio.*SecurityContext` | see `values.yaml` | Bundled MinIO security contexts. |
| `minio.resources` | `{}` | Bundled MinIO resources. |
| `minio.nodeSelector`, `minio.tolerations`, `minio.affinity` | empty | Bundled MinIO scheduling controls. |
| `minio.extraEnv`, `minio.extraEnvFrom` | `[]` | Additional bundled MinIO env settings. |
| `minio.extraVolumes`, `minio.extraVolumeMounts` | `[]` | Additional bundled MinIO volumes and mounts. |
| `minio.livenessProbe`, `minio.readinessProbe`, `minio.startupProbe` | see `values.yaml` | Bundled MinIO probes. |
| `minio.setup.enabled` | `true` | Run bucket/CORS setup job for bundled MinIO. |
| `minio.setup.corsAllowedOrigins` | `["*"]` | CORS origins configured on bundled MinIO. |
| `ingress.enabled` | `false` | Create Kubernetes ingress. |
| `ingress.className` | `""` | Ingress class name. |
| `ingress.annotations` | `{}` | Ingress annotations. |
| `ingress.hosts` | local example hosts | Ingress host/path rules. |
| `ingress.tls` | `[]` | Ingress TLS entries. |
| `serviceAccount.create` | `true` | Create a service account. |
| `serviceAccount.automountServiceAccountToken` | `false` | Automount Kubernetes API tokens into pods. |
| `serviceAccount.annotations` | `{}` | Service account annotations. |
| `serviceAccount.name` | `""` | Existing service account name when `create=false`. |

## Validation

Useful checks while changing the chart:

```sh
helm lint charts/storagetron
helm template storagetron charts/storagetron
helm template storagetron charts/storagetron -f charts/storagetron/values-production.yaml
helm template storagetron charts/storagetron --set ingress.enabled=true
```
