# syntax=docker/dockerfile:1.26
FROM node:26-alpine AS builder

WORKDIR /build

# hadolint ignore=DL3018
RUN apk add --no-cache pnpm

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc .node-version ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    --mount=type=cache,target=/root/.cache/pnpm \
    pnpm install --frozen-lockfile

COPY . .
RUN --mount=type=cache,target=/root/.cache/pnpm \
    pnpm exec node tools/offline-indexer/esbuild.mjs

FROM node:26-alpine

WORKDIR /app

# hadolint ignore=DL3018
RUN apk add --no-cache binutils libarchive-tools tar zstd

COPY --from=builder /build/dist/offline-indexer/index.cjs /app/index.cjs
COPY tools/offline-indexer/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
