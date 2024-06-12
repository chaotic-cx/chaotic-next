FROM node:22-bookworm-slim AS builder

WORKDIR /build
COPY . /build

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install
RUN pnpm build

FROM node:22-bookworm-slim

WORKDIR /app
COPY ./entry_point.sh /entry_point.sh
RUN chmod +x /entry_point.sh
COPY --from=builder /build/dist /app
COPY --from=builder /build/node_modules /app/node_modules

EXPOSE 3000
VOLUME ["/app/tdlib"]

ENTRYPOINT ["/entry_point.sh"]
