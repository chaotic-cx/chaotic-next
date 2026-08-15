import { registerAs } from '@nestjs/config';

export default registerAs('repoMan', () => ({
  regenDatabase: process.env.REPOMANAGER_REGEN_DB ?? false,
  schedulerInterval: process.env.REPOMANAGER_SCHEDULE ?? '0 * * * *',
  abiDryRun: process.env.REPOMANAGER_ABI_DRY_RUN !== 'false',
  // The Arch mirror also serves as the build mirror. Polling its `lastupdate`
  // file tells us when the repo has been re-synced, and the same mirror hosts
  // the .pkg.tar.zst files we scan.
  mirrorUrl: process.env.REPOMANAGER_MIRROR_URL ?? 'https://arch.mirror.constant.com',
  mirrorPollInterval: process.env.REPOMANAGER_MIRROR_POLL ?? '0 * * * * *',
  signalScanEnabled: process.env.REPOMANAGER_SIGNAL_SCAN_ENABLED === 'true',
}));
