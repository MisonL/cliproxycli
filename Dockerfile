ARG VERSION=dev
ARG COMMIT=none
ARG BUILD_DATE=unknown
ARG GO_VERSION=1.24

FROM oven/bun:1 AS frontend-builder
WORKDIR /app
COPY management-center/package.json ./
RUN bun install || (echo "Retrying bun install..." && rm -f bun.lock bun.lockb && bun install)
COPY management-center/ ./
RUN bunx vite build
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