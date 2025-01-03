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

- Angular (PrimeNG, GarudaNG)
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
