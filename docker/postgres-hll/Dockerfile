# PostgreSQL with the postgresql-hll extension compiled in.
FROM postgres:18-alpine

# renovate: datasource=github-tags depName=citusdata/postgresql-hll versioning=semver-coerced
ENV POSTGRESQL_HLL_VERSION="v2.21"

RUN apk add --no-cache build-base postgresql18-dev git \
    && git clone --depth 1 --branch "$POSTGRESQL_HLL_VERSION" https://github.com/citusdata/postgresql-hll.git /tmp/postgresql-hll \
    && cd /tmp/postgresql-hll \
    && make with_llvm=no \
    && make with_llvm=no install \
    && rm -rf /tmp/postgresql-hll \
    && apk del build-base postgresql18-dev git
