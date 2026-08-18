# AGENTS.md

Guidance for AI agents and contributors working in this repository.

## What this is

**Chaotic-AUR Next** is a monorepo powering [Chaotic-AUR](https://aur.chaotic.cx).
It is a package repository (an AUR/Arch Linux integration) consisting of three
Nx-managed projects:

- **`backend/`** — NestJS API running on Fastify. Repository management,
  package/build data, router & download metrics, GitLab integration, and
  authentication.
- **`frontend/`** — Angular (OptimusUI + TailwindCSS) website.
- **`shared-lib/`** — shared constants and TypeScript types used by both.
- **`backend-e2e/`** — end-to-end API tests.

## What it does

- **Repository management** (`backend/src/repo-manager`): watches Arch Linux
  (core/extra) for updates, computes rebuild triggers, and bumps dependent
  Chaotic-AUR packages.
- **ELF signal scanner**: scans `.pkg.tar.zst` archives with `bsdtar`,
  `readelf`, and `nm` to index sonames and exported/imported symbols, driving
  dependency detection and plugin-break (e.g. kwin) detection.
- Package, router, and download-metrics APIs.
- Frontend: charts, build logs, MR overview, mirror map.
- GitLab integration for merge-request reviews and pipelines.
- Build events via Redis / Moleculer.

## Tech stack

- **Nx** monorepo (`nx.json`), `pnpm` workspaces (`pnpm-workspace.yaml`)
- **NestJS** on **Fastify**
- **Angular** 22 with **OptimusUI** and **TailwindCSS**
- **TypeORM** + PostgreSQL
- Redis / **Moleculer** for build events
- **Vitest** for tests
- **ESLint** (flat config) + **Prettier**

## Prerequisites

Node.js 26+, pnpm 11+, a PostgreSQL database (Redis only needed for Moleculer
build-event handling). Environment is configured via `.env`.

## Useful commands

Run from the repo root:

```bash
pnpm install                        # install dependencies
pnpm build                          # build all projects (nx run-many --target=build --all)
pnpm test                           # run all unit tests (Vitest)
pnpm test:full                      # run full test suites
pnpm test:e2e                       # run backend-e2e tests
pnpm test:watch                     # watch mode
pnpm test:coverage:combined         # coverage across all suites and merged report
pnpm lint                           # lint all projects (nx run-many --target=lint)
pnpm format                         # format with Prettier
pnpm typecheck                      # tsc --noEmit (builds/tests do NOT typecheck)
pnpm start:be                       # start backend via nx
pnpm start:fe                       # start frontend dev server
```

Target a single project with `pnpm exec nx <target> <project>`, e.g.
`pnpm exec nx test backend`, `pnpm exec nx build frontend`.

## Testing

- **Unit tests**: Vitest. Backend tests use `backend/vite.config.mts`
  (`pnpm exec nx test backend`).
- **E2E tests**: `backend-e2e` (`pnpm test:e2e`), run with `vitest run`.
- Coverage: `pnpm test:coverage:combined` runs all suites with coverage and
  merges the final reports into `coverage/`.

## Linting & formatting

- **ESLint** with flat config (`eslint.config.mjs` at root, plus per-project
  `backend/eslint.config.mjs` and `frontend/eslint.config.mjs`). Enforces
  `@nx/enforce-module-boundaries` and `@typescript-eslint/naming-convention`
  (PascalCase types/classes, camelCase functions/methods, no leading
  underscores, interface names must NOT start with `I`).
- **Prettier** (`.prettierrc.mjs`) for formatting.
- Run both via `pnpm lint` and `pnpm format`. Also note treefmt
  (`.treefmt.toml`) and pre-commit hooks are configured.

## Conventions

- TypeScript everywhere; **strict mode is enabled in every project** (backend,
  backend-e2e, frontend, shared-lib) and enforced by the CI `typecheck` target.
  Avoid `any` where possible. TypeORM entity columns use `!:` definite
  assignment; nullable columns are typed `T | null`.
- Follow the existing class-based structure in the backend (TypeORM entities +
  services); entities are in `*.entity.ts` within each module.
- Follow Angular 22 conventions: prefer signals/computed over constructor
  subscriptions; httpResource instead of subscriptions.
- Module boundary rule is enforced by Nx — `shared-lib` is the place for
  cross-project constants/types.
- Do not add comments unless they clarify non-obvious intent; the codebase
  values clean, self-documenting code.

## Clean code expectations

The codebase has known smell hotspots — do not add to them and fix them when
you touch the surrounding code (boy-scout rule). Before finishing any
TypeScript change, check:

- **No magic numbers** — replace with named constants. Known offenders:
  `pkgType === '0'/'1'`, batch size `1000` repeated ~8×, cache TTL `30000`,
  `parseInt(item.status) !== 4`, `7 * 24 * 60 * 60 * 1000` log expiry.
- **No dead code** — remove unused services/pipes/helpers (e.g. several
  unused `getBuildsPerPackage*` / `getLatestBuilds*` methods in
  `frontend/src/app/app.service.ts`, `TruncatePipe`, `RepoPipe`,
  `getPackageConfig`, `decodeOwnerKey` in the backend).
- **No duplication (DRY)** — the repo already repeats the same logic in
  multiple places; prefer one shared source of truth. Known offenders:
  `getProvidedSonames`/`getRuntimeVersions` duplicated across the backend,
  `createRange()`/`unsetRounding()`/`typed()` helpers copy-pasted across
  frontend components, near-identical chart configs.
- **No obscured intent** — no clever one-liners, no undocumented numeric
  flag/string-encoded status hacks, no magic `@ts-expect-error` flags. Be
  explicit.
- **Functions do one thing** — keep functions short and single-purpose;
  extract helpers rather than piling work into one function.
- **Boundary conditions** — guard array indexes (e.g. `name.split('/')[2]`),
  empty inputs, and always-true/false conditions.
- **Prefer maps/lookups over long switch/if-else chains** where the branches
  are just data (e.g. status-name mappings, pipes).
