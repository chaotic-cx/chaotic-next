# Chaotic-AUR Next

Monorepo for all Java-/Typescript projects of Chaotic-AUR.

## Building

To build the project, run the following command:

```bash
nx build frontend
nx build backend
```

To run it locally for development purposes, run the following command:

```bash
nx serve frontend
nx serve backend
```

## Running a local CORS enabled API proxy

To run a local CORS enabled API proxy, change the following constants in the `types.ts` file of the shared libs to the
following values:

```typescript
export const CAUR_BACKEND_URL = "http://localhost:8010/proxy/backend"
export const CAUR_API_URL = "http://localhost:8010/proxy/api"`
```

and run the following command afterward:

```bash
pnpm proxy
```

This will allow using the production API without CORS issues.

## Integrate with editors

Enhance your Nx experience by installing [Nx Console](https://nx.dev/nx-console) for your favorite editor. Nx Console
provides an interactive UI to view your projects, run tasks, generate code, and more! Available for VSCode, IntelliJ and
comes with a LSP for Vim users.

## Nx plugins and code generators

Add Nx plugins to leverage their code generators and automated, inferred tasks.

```
# Add plugin
npx nx add @nx/react

# Use code generator
npx nx generate @nx/react:app demo

# Run development server
npx nx serve demo

# View project details
npx nx show project demo --web
```

Run `npx nx list` to get a list of available plugins and whether they have generators. Then run
`npx nx list <plugin-name>` to see what generators are available.

Learn more about [code generators](https://nx.dev/features/generate-code) and
[inferred tasks](https://nx.dev/concepts/inferred-tasks) in the docs.

## Running tasks

To execute tasks with Nx use the following syntax:

```
npx nx <target> <project> <...options>
```

You can also run multiple targets:

```
npx nx run-many -t <target1> <target2>
```

..or add `-p` to filter specific projects

```
npx nx run-many -t <target1> <target2> -p <proj1> <proj2>
```

Targets can be defined in the `package.json` or `projects.json`. Learn more
[in the docs](https://nx.dev/features/run-tasks).
