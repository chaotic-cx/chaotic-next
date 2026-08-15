import { Logger } from '@nestjs/common';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

let container: StartedPostgreSqlContainer | undefined;

export async function setup(): Promise<void> {
  Logger.overrideLogger(false);
  const loggerMethods = ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'] as const;
  for (const method of loggerMethods) {
    Logger.prototype[method] = () => undefined;
  }

  container = await new PostgreSqlContainer('postgres:18-alpine')
    .withDatabase('chaotic')
    .withUsername('chaotic')
    .withPassword('chaotic')
    .withEnvironment({ TZ: 'UTC', PGTZ: 'UTC' })
    .start();

  process.env.NODE_ENV = 'development';
  process.env.PG_HOST = container.getHost();
  process.env.PG_PORT = String(container.getPort());
  process.env.PG_USER = container.getUsername();
  process.env.PG_PASSWORD = container.getPassword();
  process.env.PG_DATABASE = container.getDatabase();
  process.env.REDIS_PASSWORD = 'dummy';
  process.env.CAUR_DB_KEY = '00000000000000000000000000000000';
  process.env.CAUR_GITLAB_ID_CAUR = 'test-project-id';
  process.env.CAUR_GITLAB_TOKEN = 'test-gitlab-token';
  process.env.CAUR_GITLAB_WEBHOOK_TOKEN = 'test-webhook-token';
  process.env.CAUR_VAPID_PUBLIC =
    'BPWNRtrPfUjhwu8ST1Se2jfU0P_u5YJ0uo3xCovSkNEor1XY4ZX_HVriwh0T1_a3rvoD2oFymAxvNyUe4PthHXQ';
  process.env.CAUR_VAPID_PRIVATE = 'epJJES7PtVQ19YkI67dn6Ndf23U-rVr4Gr8mrZQeoqw';
}

export async function teardown(): Promise<void> {
  if (container) {
    await container.stop();
    container = undefined;
  }
}
