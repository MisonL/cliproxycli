ARG VERSION=dev
ARG COMMIT=none
ARG BUILD_DATE=unknown
ARG GO_VERSION=1.24

FROM oven/bun:1.1.26 AS frontend-builder
WORKDIR /app
COPY management-center/package.json management-center/bun.lock ./
# Install dependencies with frozen lockfile for reproducibility
RUN bun install --frozen-lockfile
COPY management-center/ ./
# Use 'bun run build' for type checking & vite build
RUN bun run build
RUN ls -la dist/ || echo "dist still missing"


FROM golang:${GO_VERSION}-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./

RUN go mod download

COPY . .
COPY --from=frontend-builder /app/dist/index.html internal/managementasset/embedded/management.html

ARG VERSION
ARG COMMIT
ARG BUILD_DATE

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w -X 'main.Version=${VERSION}' -X 'main.Commit=${COMMIT}' -X 'main.BuildDate=${BUILD_DATE}'" -o ./CLIProxyAPI ./cmd/server/


FROM alpine:3.22.0

RUN apk add --no-cache tzdata

RUN mkdir /CLIProxyAPI
RUN mkdir /CLIProxyAPI/static
RUN mkdir /CLIProxyAPI/data

COPY --from=builder ./app/CLIProxyAPI /CLIProxyAPI/CLIProxyAPI
COPY --from=frontend-builder /app/dist/index.html /CLIProxyAPI/static/management.html

COPY config.example.yaml /CLIProxyAPI/config.example.yaml

WORKDIR /CLIProxyAPI

EXPOSE 8317

ENV TZ=Asia/Shanghai

RUN cp /usr/share/zoneinfo/${TZ} /etc/localtime && echo "${TZ}" > /etc/timezone

CMD ["./CLIProxyAPI"]