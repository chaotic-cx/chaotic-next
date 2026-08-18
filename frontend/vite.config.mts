import angular from '@analogjs/vite-plugin-angular';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: '../node_modules/.vite/frontend',
  plugins: [angular()],
  resolve: {
    alias: {
      '@chaotic-next/shared-lib': fileURLToPath(new URL('../shared-lib/src/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'frontend',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'json-summary', 'html'],
      reportsDirectory: fileURLToPath(new URL('../coverage/frontend', import.meta.url)),
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/**/*.{test,spec}.ts'],
    },
  },
});
