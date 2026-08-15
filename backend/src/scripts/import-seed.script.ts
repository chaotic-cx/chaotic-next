import { SeedTransferService } from '../repo-manager/seed-transfer.service';
import { bootstrapScript, elapsedSeconds, runScript } from '../utils/script-utils';

const DEFAULT_SEED_PATH = 'seed.json';

async function main(): Promise<void> {
  const app = await bootstrapScript(['debug', 'log', 'warn', 'error']);
  const service = app.get(SeedTransferService);

  const path = process.argv[2] ?? DEFAULT_SEED_PATH;
  const started = Date.now();
  console.log(`Importing seed from ${path}...`);
  await service.importSeedFile(path);
  console.log(`Seed import finished in ${elapsedSeconds(started)}s`);

  await app.close();
}

runScript(main);
