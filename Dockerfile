ARG VERSION=dev
ARG COMMIT=none
ARG BUILD_DATE=unknown

FROM oven/bun:1 AS frontend-builder
WORKDIR /app
COPY management-center/package.json management-center/bun.lockb ./
RUN bun install --frozen-lockfile || (echo "Retrying without lockfile..." && rm bun.lockb && bun install)
COPY management-center/ ./
RUN bun run build || echo "Build failed, proceeding with empty assets..."

FROM golang:1.24-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./

RUN go mod download

COPY . .

ARG VERSION
ARG COMMIT
ARG BUILD_DATE

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w -X 'main.Version=${VERSION}' -X 'main.Commit=${COMMIT}' -X 'main.BuildDate=${BUILD_DATE}'" -o ./CLIProxyAPI ./cmd/server/

FROM alpine:3.22.0

RUN apk add --no-cache tzdata

RUN mkdir /CLIProxyAPI
RUN mkdir /CLIProxyAPI/static

COPY --from=builder ./app/CLIProxyAPI /CLIProxyAPI/CLIProxyAPI
COPY --from=frontend-builder /app/dist/index.html /CLIProxyAPI/static/management.html

COPY config.example.yaml /CLIProxyAPI/config.example.yaml

WORKDIR /CLIProxyAPI

EXPOSE 8317

ENV TZ=Asia/Shanghai

RUN cp /usr/share/zoneinfo/${TZ} /etc/localtime && echo "${TZ}" > /etc/timezone

CMD ["./CLIProxyAPI"]