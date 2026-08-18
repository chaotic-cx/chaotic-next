import { build } from 'esbuild';

await build({
  entryPoints: ['backend/src/repo-manager/offline/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'esnext',
  outfile: 'dist/offline-indexer/index.cjs',
  logLevel: 'info',
});
