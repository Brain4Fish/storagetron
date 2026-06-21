{{- define "storagetron.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "storagetron.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "storagetron.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "storagetron.labels" -}}
helm.sh/chart: {{ include "storagetron.chart" . }}
app.kubernetes.io/name: {{ include "storagetron.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "storagetron.selectorLabels" -}}
app.kubernetes.io/name: {{ include "storagetron.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "storagetron.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "storagetron.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "storagetron.apiName" -}}
{{- printf "%s-api" (include "storagetron.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "storagetron.webName" -}}
{{- printf "%s-web" (include "storagetron.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "storagetron.postgresqlName" -}}
{{- printf "%s-postgresql" (include "storagetron.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "storagetron.minioName" -}}
{{- printf "%s-minio" (include "storagetron.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "storagetron.databaseUrl" -}}
{{- if .Values.api.databaseUrl -}}
{{- .Values.api.databaseUrl -}}
{{- else -}}
{{- printf "postgres://%s:%s@%s:%v/%s" .Values.postgresql.auth.username .Values.postgresql.auth.password (include "storagetron.postgresqlName" .) .Values.postgresql.service.port .Values.postgresql.auth.database -}}
{{- end -}}
{{- end -}}

{{- define "storagetron.s3Endpoint" -}}
{{- if .Values.api.s3.endpoint -}}
{{- .Values.api.s3.endpoint -}}
{{- else -}}
{{- printf "http://%s:%v" (include "storagetron.minioName" .) .Values.minio.service.apiPort -}}
{{- end -}}
{{- end -}}

{{- define "storagetron.s3PublicEndpoint" -}}
{{- if .Values.api.s3.publicEndpoint -}}
{{- .Values.api.s3.publicEndpoint -}}
{{- else -}}
{{- printf "http://%s:%v" (include "storagetron.minioName" .) .Values.minio.service.apiPort -}}
{{- end -}}
{{- end -}}

{{- define "storagetron.s3Bucket" -}}
{{- default .Values.minio.bucket .Values.api.s3.bucket -}}
{{- end -}}

{{- define "storagetron.s3AccessKey" -}}
{{- default .Values.minio.auth.rootUser .Values.api.s3.accessKey -}}
{{- end -}}

{{- define "storagetron.s3SecretKey" -}}
{{- default .Values.minio.auth.rootPassword .Values.api.s3.secretKey -}}
{{- end -}}

{{- define "storagetron.webApiUrl" -}}
{{- if .Values.web.nextPublicApiUrl -}}
{{- .Values.web.nextPublicApiUrl -}}
{{- else -}}
{{- printf "http://%s:%v" (include "storagetron.apiName" .) .Values.api.service.port -}}
{{- end -}}
{{- end -}}
