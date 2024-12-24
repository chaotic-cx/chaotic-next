import { registerAs } from '@nestjs/config';

export default registerAs('repoMan', () => ({
  cooldownDays: process.env.REPOMANAGER_COOLDOWN_DAYS ?? 7,
  gitAuthor: process.env.GIT_AUTHOR ?? 'Temeraire',
  gitEmail: process.env.GIT_EMAIL ?? 'ci@chaotic.cx',
  gitUsername: process.env.GIT_USERNAME ?? 'git',
  globalBlocklist: process.env.REPOMANAGER_NEVER_REBUILD ?? '[]',
  globalTriggers: process.env.REPOMANAGER_ALWAYS_REBUILD ?? '[]',
  regenDatabase: process.env.REPOMANAGER_REGEN_DB ?? false,
  schedulerInterval: process.env.REPOMANAGER_SCHEDULE ?? '0 * * * *',
}));
