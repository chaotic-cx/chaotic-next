# Chaotic-AUR Next

Monorepo for all Java-/Typescript projects of Chaotic-AUR. Includes:

- Part of repository management (.so lib bumps, up-to-date in-depth package data, etc..)
- Router stats
- Package, Router, Metrics API
- Chaotic-AURs website
- Smaller helper functions / API

## Building

To build the project, run the following command:

```bash
pnpm build
```

To run it locally for development purposes, run the following command:

```bash
pnpm start:home
pnpm start:be-nx
```

## Running a local CORS-enabled API proxy

To run a local CORS-enabled API proxy, change the following constants in the `types.ts` file of the shared libs to the
following values:

```typescript
export const CAUR_BACKEND_URL = 'http://localhost:8010/proxy/backend';
export const CAUR_API_URL = 'http://localhost:8010/proxy/api';
```

and run the following command afterward:

```bash
pnpm proxy:api
pnpm proxy:be
```

This will allow using the production API without CORS issues.

## Tech Stack

- Angular (OptimusUI, GarudaNG)
- NestJs (Fastify, Passport, TypeORM, Swagger)
- Nx (Monorepo management)
- Postgresql
- Redis
- TailwindCSS
- TypeORM
- Typescript

## Backend

### Required environment variables

- AUTH0_AUDIENCE: Auth0 audience to target
- AUTH0_CLIENT_ID: Auth0 client id
- AUTH0_CLIENT_SECRET: Auth0 client secret
- AUTH0_DOMAIN: Auth0 domain
- CAUR_JWT_SECRET: JWT secret for the backend
- CAUR_TRUST_PROXY: IP address of the proxy, if any
- CAUR_USERS: JSON object with user ids and roles
- NODE_ENV: "production" / any other for dev (will enable TypeORM sync mode)
- PG_DATABASE: Postgres database to use
- PG_HOST: Host name of the Postgres database
- PG_PASSWORD: Postgres password
- PG_USER: Postgres user
- REDIS_PASSWORD: Redis password to connect with the Chaotic Manager (Moleculer microservice)
- REDIS_SSH_HOST: Host of the Redis server, used for SSH port forwarding the Redis instance
- REDIS_SSH_USER: User to use for SSH port forwarding the Redis instance

## Database structure (as of November 2024)

![ERD](./assets/ERD.svg)

## Database migrations

The schema is managed with TypeORM migrations. They run **automatically at
startup** (`migrationsRun: true` in `backend/src/data.source.ts`), so a fresh
database is created on first boot without manual steps.

### Running migrations

- **At runtime (automatic):** the backend applies pending migrations on startup,
  so `nx serve backend` (or the production build) is all you need.
- **Manually** (e.g. against a standalone DB), from the repo root:

  ```sh
  PG_HOST=localhost PG_USER=chaotic PG_PASSWORD=chaotic PG_DATABASE=chaotic \
    TS_NODE_TRANSPILE_ONLY=1 TS_NODE_PROJECT=backend/tsconfig.app.json \
    ./node_modules/.bin/typeorm-ts-node-commonjs migration:run \
      --dataSource backend/src/migration-cli.ts
  ```

### Creating a new migration

Migrations are checked into `backend/src/migrations/`. To create one:

1. **Generate from entity changes** (diff of the schema vs. your current
   entities), from the repo root against a writable local database:

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

3. **Register the new migration** by importing it **explicitly** in both:
   - `backend/src/data.source.ts` (the runtime `migrations` array)
   - `backend/src/migration-cli.ts` (the CLI `migrations` array)

## Integrate with editors

Enhance your Nx experience by installing [Nx Console](https://nx.dev/nx-console) for your favorite editor. Nx Console
provides an interactive UI to view your projects, run tasks, generate code, and more! Available for VSCode, IntelliJ and
comes with a LSP for Vim users.

## Nx plugins and code generators

Add Nx plugins to leverage their code generators and automated, inferred tasks.

```
# Add plugin
pnpm exec nx add @nx/react

# Use code generator
pnpm exec nx generate @nx/react:app demo

# Run development server
pnpm exec nx serve demo

# View project details
pnpm exec nx show project demo --web
```

Run `pnpm exec nx list` to get a list of available plugins and whether they have generators. Then run
`pnpm exec nx list <plugin-name>` to see what generators are available.

Learn more about [code generators](https://nx.dev/features/generate-code) and
[inferred tasks](https://nx.dev/concepts/inferred-tasks) in the docs.

## Running tasks

To execute tasks with Nx use the following syntax:

```
pnpm exec nx <target> <project> <...options>
```

You can also run multiple targets:

```
pnpm exec nx run-many -t <target1> <target2>
```

..or add `-p` to filter specific projects

```
pnpm exec nx run-many -t <target1> <target2> -p <proj1> <proj2>
```

Targets can be defined in the `package.json` or `projects.json`. Learn more
[in the docs](https://nx.dev/features/run-tasks).
