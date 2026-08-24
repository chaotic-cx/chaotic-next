# syntax=docker/dockerfile:1.7
FROM node:26-alpine AS builder

ENV NODE_ENV=production

WORKDIR /build

# hadolint ignore=DL3018
RUN apk add --no-cache --virtual builds-deps build-base pnpm git

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY patches ./patches

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    --mount=type=cache,target=/root/.cache/pnpm \
    pnpm install --frozen-lockfile

COPY . .

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

RUN --mount=type=cache,target=/root/.nx \
    pnpm exec nx run backend:build && \
    cp pnpm-workspace.yaml dist/backend/pnpm-workspace.yaml && \
    cp -r patches dist/backend/patches

WORKDIR /build/dist/backend

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    --mount=type=cache,target=/root/.cache/pnpm \
    pnpm install --prod --frozen-lockfile

FROM node:26-alpine

ENV NODE_ENV=production

WORKDIR /app

# hadolint ignore=DL3018
RUN apk add --no-cache autossh curl zstd bash tar binutils libarchive-tools file
COPY entry_point.sh /entry_point.sh
RUN chmod +x /entry_point.sh
COPY --from=builder /build/dist/backend /app

LABEL maintainer="Nico Jensch <dr460nf1r3@chaotic.cx>"
LABEL description="Backend for the Chaotic-AUR website and other smaller services"
LABEL version="1.0"
LABEL org.opencontainers.image.source="https://github.com/chaotic-cx/chaotic-next"
LABEL org.opencontainers.image.authors="Nico Jensch <dr460nf1r3@chaotic.cx>"
LABEL org.opencontainers.image.description="Backend for the Chaotic-AUR website and other smaller services"
LABEL org.opencontainers.image.version="1.0"

HEALTHCHECK --interval=30s --timeout=15s --start-period=10s --retries=3 \
  CMD curl -sfI --connect-timeout 15 http://127.0.0.1:3000/builder/packages || exit 1

STOPSIGNAL SIGTERM

EXPOSE 3000

ENTRYPOINT ["/entry_point.sh"]
