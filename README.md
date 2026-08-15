# Chaotic-AUR Next

Monorepo for the TypeScript projects that power [Chaotic-AUR](https://aur.chaotic.cx).
It contains the backend API, the frontend website and a small shared library.

- **backend/** — NestJS (Fastify) API: repository management, package/build data,
  router & download metrics, GitLab integration, authentication
- **frontend/** — Angular (OptimusUI) website
- **shared-lib/** — shared constants and TypeScript types used by both

## Features

- Repository management: watches Arch Linux (core/extra) for updates, computes
  rebuild triggers and bumps dependent Chaotic-AUR packages
- **ELF signal scanner**: scans `.pkg.tar.zst` archives with `bsdtar`, `readelf`
  and `nm` to index sonames, imported/exported symbols and directory ownership.
  This drives dependency detection and catches plugin breaks (e.g. kwin) that a
  plain soname diff would miss.
- Package, router and download-metrics API
- Chaotic-AUR website with charts, build logs, MR overview and mirror map
- GitLab integration for merge request reviews and pipelines

## Tech Stack

- [Nx](https://nx.dev) monorepo management
- [NestJS](https://nestjs.com) on [Fastify](https://fastify.dev)
- [Angular](https://angular.dev) with [OptimusUI](https://github.com/openng/optimus-ui) and TailwindCSS
- [TypeORM](https://typeorm.io) + PostgreSQL
- Redis (Chaotic Manager / Moleculer microservice)
- [Moleculer](https://moleculer.services) for build events
- TypeScript, Vitest

## Prerequisites

- Node.js 26+ and `pnpm` 11+
- A PostgreSQL database
- Redis (optional; only needed for Moleculer build-event handling)

Copy `.env` to your environment and adjust at least `PG_*`, `CAUR_JWT_SECRET`
and `CAUR_USERS`. A local development setup can use a `docker run` Postgres:

```bash
docker run --name chaotic-pg -e POSTGRES_USER=chaotic -e POSTGRES_PASSWORD=chaotic \
  -e POSTGRES_DB=chaotic -p 5432:5432 -d postgres
```

## Development

Install dependencies:

```bash
pnpm install
```

Start the backend and frontend (in two terminals):

```bash
pnpm start:be-nx
pnpm start:home
```

- Backend runs at `http://localhost:3000`, Swagger docs at `http://localhost:3000/api`
- Frontend runs at `http://localhost:4200`

The frontend dev server proxies `/backend` to `localhost:3000`, `/api` and
`/router` to the production endpoints (see `frontend/proxy.conf.json`). To use a
local CORS-enabled API proxy instead, change `CAUR_BACKEND_URL` /
`CAUR_API_URL` in `shared-lib/src/lib/types.ts` and run `pnpm proxy:api` /
`pnpm proxy:be`.

### Build, test, lint

```bash
pnpm build        # build all projects
pnpm test         # run all tests (Vitest)
pnpm lint         # run all linters (eslint)
pnpm format       # format with prettier
```

You can also target a single project, e.g. `pnpm exec nx test backend`.

## Environment variables (backend)

See `backend/src/config/` for the full list. The most important ones:

| Variable                                  | Default                            | Description                                                |
| ----------------------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| `PG_HOST` / `PG_PORT`                     | `localhost` / `5432`               | PostgreSQL connection                                      |
| `PG_USER` / `PG_PASSWORD` / `PG_DATABASE` | `chaotic`                          | PostgreSQL credentials                                     |
| `NODE_ENV`                                | `development`                      | `production` disables TypeORM schema sync                  |
| `CAUR_PORT`                               | `3000`                             | Backend listen port                                        |
| `CAUR_DB_KEY`                             | —                                  | AES key used to encrypt repo API tokens at rest            |
| `CAUR_JWT_SECRET`                         | —                                  | JWT secret for the backend                                 |
| `AUTH0_*`                                 | —                                  | Auth0 OAuth configuration                                  |
| `REDIS_PASSWORD` / `REDIS_SSH_*`          | —                                  | Redis + SSH tunnel for Moleculer events                    |
| `REPOMANAGER_SCHEDULE`                    | `0 * * * *`                        | Cron schedule for the repo-manager run                     |
| `REPOMANAGER_MIRROR_URL`                  | `https://arch.mirror.constant.com` | Arch mirror used for the `.files` DBs and package archives |
| `REPOMANAGER_MIRROR_POLL`                 | `0 * * * * *`                      | Cron schedule for mirror `lastupdate` polling              |
| `REPOMANAGER_SIGNAL_SCAN_ENABLED`         | `false`                            | Enable the ELF signal scanner                              |
| `REPOMANAGER_ABI_DRY_RUN`                 | `true`                             | Log plugin-ABI bumps instead of rebuilding                 |

## Repo manager & the ELF signal scanner

The repo manager (`backend/src/repo-manager/`) watches the Arch mirror:

1. A cron job pulls the `core`/`extra` `.files` databases on the configured
   `REPOMANAGER_SCHEDULE`.
2. It diffs package versions against the stored `archlinux_package` rows to find
   changed packages, then clones the Chaotic-AUR repos and computes rebuild
   triggers (explicit, global, dependency or plugin-ABI based).
3. When `REPOMANAGER_SIGNAL_SCAN_ENABLED=true`, changed Arch packages are
   downloaded and scanned for ELF signals before triggers are computed.

A second cron job polls the mirror's `lastupdate` file so repo re-syncs are
noticed near-instantly (`REPOMANAGER_MIRROR_POLL`).

### ELF signal scanning

The scanner (`backend/src/repo-manager/signal.ts` + `signal-scan.service.ts`)
downloads a package archive and, per shipped ELF object (shared objects **and**
executables):

- `bsdtar -tf` → file list (used for directory-ownership / plugin detection)
- `bsdtar -tvf` → executable bit per file (to also read `DT_NEEDED` of binaries)
- `readelf -d` → `DT_NEEDED` + `SONAME`
- `nm -D --undefined-only` → imported symbols
- `nm -D --defined-only` → exported symbols (shared objects only)

Results are stored in `package_elf_analysis` (keyed by `pkgType`, `pkgId`,
`version`); the directory-ownership index used for plugin detection is derived
from it in memory on demand.

### Broken-dependency detection

Each analysis also carries a `broken` flag + `brokenReasons`. A package is
flagged broken (the static equivalent of checkrebuild's `ldd "not found"` scan)
when it:

- links a soname (`DT_NEEDED`) that neither the global provided-soname index nor
  the base system provides — a dependency was dropped or its soname renamed, or
- ships files under a **stale versioned runtime directory** — e.g. files in
  `usr/lib/python3.12/...` after the repo's `python` moved to 3.13 (same for
  perl/ruby/ghc).

The provided-soname index is built from all stored analyses, so a full mirror
index must be seeded first for accurate results. Missing-soname detection is
skipped until the index is populated to avoid false positives on a fresh DB.

Broken packages are listed with:

```bash
curl -X GET https://<host>/repo/broken
```

When `REPOMANAGER_SIGNAL_SCAN_ENABLED=true`, a package that _newly_ becomes
broken after an Arch update is rebuilt automatically (a `BROKEN_DEPS` bump).
Only breaks introduced by the current run count, so long-standing issues don't
cause rebuild loops. Like the plugin-ABI channel, this respects
`REPOMANAGER_ABI_DRY_RUN` (log-only unless set to `false`).

### One-off full indexing

The regular scan only processes _changed_ packages. To bootstrap or repair the
full signal index, the API exposes two admin routes:

```bash
# Index the full Arch mirror (core + extra). No payload.
curl -X POST https://<host>/repo/index/arch

# Index a full Chaotic-AUR repo from its database URL.
curl -X POST https://<host>/repo/index/chaotic \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://<mirror>/x86_64/chaotic-aur.files"}'
```

Both pull the repo `.files` database once, ensure every package has a DB row,
and download + scan only packages that don't yet have an analysis for their
current version — so re-running only backfills gaps. Downloads are batched and
scans run with bounded concurrency.

### Manual signal scan & seed export/import

```bash
# Re-scan the packages that changed since the last pull
curl -X GET https://<host>/repo/signal-scan

# Dump all stored ELF analyses as JSON (bootstrap a fresh DB)
curl -X GET https://<host>/repo/signals/export > seed.json

# Import a seed produced above
curl -X POST https://<host>/repo/signals/import \
  -H 'Content-Type: application/json' --data @seed.json
```

For large seeds (a full Chaotic-AUR repo is a multi-GB NDJSON file), import it
from a shell on the backend host instead of pushing it through the HTTP body.
The `import-seed.script.ts` streams the file in batches and logs progress
(`Imported N seed entries so far`, `Derived pluginOf i/total`,
`Recomputed broken flags i/total`):

```bash
cd backend
NODE_OPTIONS="--max-old-space-size=12288" pnpm exec tsx src/import-seed.script.ts ../seed-chaotic.json
```

The import is incremental: entries whose `(pkgType, pkgId, version)` is already
stored are skipped, and the directory index is updated in place instead of
rebuilt from the whole table. The `broken`/`pluginOf` recompute writes only the
changed columns (not the heavy `files`/symbol JSONB), so re-imports are fast.

If an interrupted import left analyses in the table but the `pluginOf`/`broken`
recompute never finished (e.g. you killed the process mid-run), delete the rows
for that package type first so the re-import actually derives them instead of
skipping already-stored versions:

```bash
docker exec postgres psql -U chaotic -d chaotic \
  -c 'DELETE FROM package_elf_analysis WHERE "pkgType" = '"'"'1'"'"';'
```

### Offline mirror indexing

When a repo mirror already lives on a machine (build box, mirror server), the
backend doesn't need to re-download it. The **offline indexer** (`tools/offline-indexer/`,
source in `backend/src/repo-manager/offline/`) runs the exact same parse + scan
pipeline against a mounted mirror, purely read-only, and writes an importable
seed to a separate path:

```bash
pnpm build:offline-indexer
docker build -f tools/offline-indexer/Dockerfile -t chaotic/offline-indexer .
docker run --rm \
  -v /mnt/arch-mirror:/mirror:ro \
  -v /srv/seeds:/out \
  -e MIRROR=/mirror -e OUT=/out/seed.json \
  chaotic/offline-indexer
```

By default it indexes Arch's `core`/`extra` repos (database and archives under
`os/x86_64`). It also indexes Chaotic-AUR / Garuda (or any repo-format mirror
whose packages live under `x86_64`) by pointing `MIRROR` at the parent repos
directory and setting `REPOS` and `ARCH_DIR`:

```bash
docker run --rm \
  -v /srv/http/repos:/repos:ro \
  -v /srv/seeds:/out \
  -e MIRROR=/repos \
  -e REPOS=chaotic-aur,garuda \
  -e ARCH_DIR=x86_64 \
  -e OUT=/out/seed.json \
  chaotic/offline-indexer
```

The mirror is mounted read-only (`:ro`); the seed is written to `$OUT`. It emits
`pkgname`-identified entries (instead of DB ids), so `POST /repo/signals/import`
resolves them to the live database and derives `pluginOf`/`broken` flags there.
Requires `bsdtar` (`libarchive-tools`) and `binutils` (both installed in the image).

## Database migrations

The schema is managed with TypeORM migrations. They run **automatically at
startup** (`migrationsRun: true` in `backend/src/data/data.source.ts`), so a fresh
database is created on first boot without manual steps.

### Running migrations manually

```sh
PG_HOST=localhost PG_USER=chaotic PG_PASSWORD=chaotic PG_DATABASE=chaotic \
  TS_NODE_TRANSPILE_ONLY=1 TS_NODE_PROJECT=backend/tsconfig.app.json \
  ./node_modules/.bin/typeorm-ts-node-commonjs migration:run \
    --dataSource backend/src/migration-cli.ts
```

### Creating a new migration

Migrations are checked into `backend/src/migrations/`. To create one:

1. **Generate from entity changes** (diff of the schema vs. your current
   entities) against a writable local database:

   ```sh
   PG_HOST=localhost PG_USER=chaotic PG_PASSWORD=chaotic PG_DATABASE=chaotic \
     TS_NODE_TRANSPILE_ONLY=1 TS_NODE_PROJECT=backend/tsconfig.app.json \
     ./node_modules/.bin/typeorm-ts-node-commonjs migration:generate \
       backend/src/migrations/<Name> --dataSource backend/src/migration-cli.ts
   ```

2. **Or create an empty migration** to hand-write the SQL:

   ```sh
   TS_NODE_TRANSPILE_ONLY=1 TS_NODE_PROJECT=backend/tsconfig.app.json \
     ./node_modules/.bin/typeorm-ts-node-commonjs migration:create \
       backend/src/migrations/<Name>
   ```

3. **Register the new migration** by importing it explicitly in the
   `migrations` array of `backend/src/data/data.source.ts` (the CLI in
   `migration-cli.ts` reuses those options).

## Database structure (as of August 2026)

![ERD](./assets/ERD.svg)

## Docker

A production image is built from the `Dockerfile`:

```bash
docker build -t chaotic-next .
```

The image installs `bsdtar`, `readelf`/`nm` (`binutils`), `tar` and `zstd` —
all required by the ELF signal scanner. The entry point (`entry_point.sh`)
optionally opens an SSH tunnel to a remote Redis host before starting the app.

## Contributing

We follow the [Contributor Covenant](CODE_OF_CONDUCT.md). Before submitting a PR:

- `pnpm lint` and `pnpm test` must pass
- New migrations must be registered in `data.source.ts`
- Commit messages should follow [Conventional Commits](https://www.conventionalcommits.org)
  (the repo ships a commitizen + commitlint pre-commit hook)
