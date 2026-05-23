FROM golang:1.25-alpine AS builder

WORKDIR /app

ARG APP_VERSION=dev
ARG APP_COMMIT=unknown
ARG APP_BUILD_DATE=unknown

RUN apk add --no-cache git

COPY go.mod ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 go build \
    -ldflags "-X github.com/Brain4Fish/storagetron/internal/version.Version=${APP_VERSION} -X github.com/Brain4Fish/storagetron/internal/version.Commit=${APP_COMMIT} -X github.com/Brain4Fish/storagetron/internal/version.Date=${APP_BUILD_DATE}" \
    -o app ./cmd/api

FROM alpine:3.19 AS runtime

WORKDIR /app

RUN apk add --no-cache ca-certificates

COPY --from=builder /app/app .
COPY migrations ./migrations

EXPOSE 8080

CMD ["./app"]
