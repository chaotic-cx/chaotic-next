import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
        keepClassNames: true,
      },
      sourceMaps: true,
    }),
  ],
  resolve: {
    alias: {
      '@chaotic-next/shared-lib': fileURLToPath(new URL('../shared-lib/src/index.ts', import.meta.url)),
      '@chaotic-next/backend/': fileURLToPath(new URL('../backend/src/', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.e2e-spec.ts'],
    globalSetup: [fileURLToPath(new URL('./src/test/global-setup.ts', import.meta.url))],
    setupFiles: [fileURLToPath(new URL('./src/test/test-setup.ts', import.meta.url))],
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
    coverage: {
      provider: 'istanbul',
      reporter: ['json', 'json-summary', 'html'],
      reportsDirectory: fileURLToPath(new URL('../coverage/backend-e2e', import.meta.url)),
      include: ['../backend/src/**/*.ts'],
      exclude: [
        '../backend/src/main.ts',
        '../backend/src/migrations/**',
        '../backend/src/migration-cli.ts',
        '../backend/src/data.source.ts',
        '../backend/src/**/*.{test,spec}.ts',
      ],
    },
  },
});
