import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { resolve } from 'node:path';
import { silenceNestLogger } from './silence-nest-logger';

let container: StartedPostgreSqlContainer | undefined;

export async function setup(): Promise<void> {
  silenceNestLogger();

  const image = 'chaotic-postgres-hll:latest';
  await PostgreSqlContainer.fromDockerfile(resolve(import.meta.dirname, '../../../docker/postgres-hll')).build(image);

  container = await new PostgreSqlContainer(image)
    .withDatabase('chaotic')
    .withUsername('chaotic')
    .withPassword('chaotic')
    .withEnvironment({ TZ: 'UTC', PGTZ: 'UTC' })
    .start();

  process.env.NODE_ENV = 'development';
  process.env.BETTER_AUTH_SECRET = 'test-secret-test-secret-test-secret-test-secret';
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
  process.env.BETTER_AUTH_TRUSTED_ORIGINS = '';
  process.env.PG_HOST = container.getHost();
  process.env.PG_PORT = String(container.getPort());
  process.env.PG_USER = container.getUsername();
  process.env.PG_PASSWORD = container.getPassword();
  process.env.PG_DATABASE = container.getDatabase();
  process.env.REDIS_PASSWORD = 'dummy';
  process.env.CAUR_DB_KEY = '00000000000000000000000000000000';
  process.env.CAUR_GITLAB_WEBHOOK_TOKEN = 'test-webhook-token';
  process.env.CAUR_VAPID_PUBLIC =
    'BPWNRtrPfUjhwu8ST1Se2jfU0P_u5YJ0uo3xCovSkNEor1XY4ZX_HVriwh0T1_a3rvoD2oFymAxvNyUe4PthHXQ';
  process.env.CAUR_VAPID_PRIVATE = 'epJJES7PtVQ19YkI67dn6Ndf23U-rVr4Gr8mrZQeoqw';
  process.env.CAUR_GITLAB_MERGE_BOT_USER_ID = '12345';
  process.env.GITHUB_TOKEN ??= 'e2e-github-stub-token';
  process.env.GITLAB_CLIENT_ID = 'mock-gitlab-client-id';
  process.env.GITLAB_CLIENT_SECRET = 'mock-gitlab-client-secret';
  // Fake key: specs exercise the real VirusTotal mapping and DB writes against a stubbed upstream.
  process.env.VIRUSTOTAL_API_KEY = 'e2e-virustotal-key';
  process.env.VIRUSTOTAL_REQUEST_SPACING_MS = '10';
  process.env.VIRUSTOTAL_POLL_INTERVAL_MS = '25';
}

export async function teardown(): Promise<void> {
  if (container) {
    await container.stop();
    container = undefined;
  }
}
