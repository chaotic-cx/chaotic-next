# Tdlib requires glibc, therefore alpine can't be used
FROM node:23-slim AS builder

WORKDIR /build
COPY . /build

# Enable the use of pnpm and compile the backend
RUN corepack enable pnpm && \
    pnpm install --ignore-scripts --no-optional && \
    pnpm exec nx run backend:build

# Generate node_modules containing nx-generated package.json for less used space
WORKDIR /build/dist/backend
RUN pnpm install --ignore-scripts --no-optional --prod && \
    pnpm install pino-pretty

FROM node:23-slim

# Copy the compiled backend and the entry point script in a clean image
WORKDIR /app
RUN apt-get update && \
  apt-get install --no-install-recommends -y autossh=1.4g-1+b1 netcat-openbsd=1.219-1 zst=0.4-1 && \
  rm -rf /var/lib/apt/lists/*

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

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 CMD [ "nc", "-z", "localhost", "3000" ]

EXPOSE 3000
VOLUME ["/app/tdlib"]

ENTRYPOINT ["/entry_point.sh"]
