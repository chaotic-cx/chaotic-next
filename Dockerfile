# Tdlib requires glibc, therefore alpine can't be used
FROM node:23-slim AS builder

WORKDIR /build
COPY . /build

# Enable the use of pnpm and compile the backend
RUN corepack enable && corepack prepare pnpm@latest --activate

# Workaround for nx post-install hanging
RUN pnpm install --ignore-scripts nx
RUN pnpm install
RUN pnpm exec nx run backend:build

# Generate node_modules containing nx-generated package.json for less used space
WORKDIR /build/dist/backend
RUN pnpm install --prod

# To have a pretty log output without needing to include it in the app
RUN pnpm install pino-pretty

FROM node:23-slim

# Copy the compiled backend and the entry point script in a clean image
WORKDIR /app
RUN apt-get update && \
  apt-get install --no-install-recommends -y autossh netcat-openbsd zstd && \
  rm -rf /var/lib/apt/lists/*

COPY entry_point.sh /entry_point.sh
RUN chmod +x /entry_point.sh
COPY --from=builder /build/dist/backend /app

EXPOSE 3000
VOLUME ["/app/tdlib"]

ENTRYPOINT ["/entry_point.sh"]
