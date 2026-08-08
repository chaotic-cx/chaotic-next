FROM node:26-alpine AS builder

WORKDIR /build
COPY . /build

# Bcrypt shenigans
# hadolint ignore=DL3018
RUN apk add --no-cache --virtual builds-deps build-base pnpm

# Enable the use of pnpm and compile the backend
RUN pnpm install && \
    pnpm exec nx run backend:build

# Allow pnpm installing bcrypt .node files
RUN cp pnpm-workspace.yaml dist/backend/pnpm-workspace.yaml

# Generate node_modules containing nx-generated package.json for less used space
WORKDIR /build/dist/backend

# Run the actual installation
RUN pnpm install --prod && \
    pnpm install pino-pretty

FROM node:26-alpine

# Copy the compiled backend and the entry point script in a clean image
WORKDIR /app

# hadolint ignore=DL3018
RUN apk add --no-cache autossh curl zstd bash tar
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
