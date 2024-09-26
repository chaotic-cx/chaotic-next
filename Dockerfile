# Tdlib requires glibc, therefore alpine can't be used
FROM node:22-bookworm-slim AS builder

WORKDIR /build
COPY . /build

# Enable the use of pnpm and compile the backend
RUN corepack enable && corepack prepare pnpm@latest --activate

# Workaround for nx post-install hanging
RUN pnpm install --ignore-scripts nx
RUN pnpm install
RUN pnpx nx reset
RUN pnpx nx run backend:build

FROM node:22-bookworm-slim

# Copy the compiled backend and the entry point script in a clean image
WORKDIR /app
COPY entry_point.sh /entry_point.sh
RUN chmod +x /entry_point.sh
COPY --from=builder /build/dist/backend /app
COPY --from=builder /build/node_modules /app/node_modules

EXPOSE 3000
VOLUME ["/app/tdlib"]

ENTRYPOINT ["/entry_point.sh"]
