import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { swcPlugin } from '../tools/vitest/swc-plugin.mts';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [swcPlugin()],
  resolve: {
    alias: {
      '@chaotic-next/shared-lib': fileURLToPath(new URL('../shared-lib/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    setupFiles: ['src/test/silence-nest-logger.ts'],
    // The signal-scan spec shells out to bsdtar/readelf/nm which can take a
    // while; a generous timeout also lets the istanbul coverage reporters emit
    // their JSON/HTML files (a too-short timeout breaks coverage finalization).
    testTimeout: 60000,
    hookTimeout: 60000,
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'json-summary', 'html'],
      reportsDirectory: fileURLToPath(new URL('../coverage/backend', import.meta.url)),
      include: ['src/**/*.ts'],
      exclude: [
        'src/main.ts',
        'src/migrations/**',
        'src/migration-cli.ts',
        'src/data.source.ts',
        'src/**/*.{test,spec}.ts',
      ],
    },
  },
});
