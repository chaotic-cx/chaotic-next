import { MigrationInterface, QueryRunner } from 'typeorm';

const ROLLUP_WINDOW_START = `(DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - INTERVAL '3 days')`;

/**
 * Add the routing repo (e.g. chaotic-aur, garuda) as a dimension of the daily
 * router-hit rollups so the dashboard can filter charts per repo. Rows inside
 * the raw-retention window are re-seeded from `router-hits` so they carry the
 * repo; older rows keep `repo = ''`, meaning "summed across all repos". A query
 * for a specific repo therefore only covers the retained window.
 */
export class RouterHitsDailyRepo1787790000000 implements MigrationInterface {
  name = 'RouterHitsDailyRepo1787790000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "router_hits_daily"
      DROP CONSTRAINT "PK_router_hits_daily"
    `);
    await queryRunner.query(`
      ALTER TABLE "router_hits_daily"
      ADD COLUMN "repo" text NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "router_hits_daily"
      ADD CONSTRAINT "PK_router_hits_daily" PRIMARY KEY ("day", "country", "hostname", "package", "repo")
    `);
    await queryRunner.query(`CREATE INDEX "router_hits_daily_repo_idx" ON "router_hits_daily" ("repo")`);

    await queryRunner.query(`
      ALTER TABLE "router_hits_daily_agents"
      DROP CONSTRAINT "PK_router_hits_daily_agents"
    `);
    await queryRunner.query(`
      ALTER TABLE "router_hits_daily_agents"
      ADD COLUMN "repo" text NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "router_hits_daily_agents"
      ADD CONSTRAINT "PK_router_hits_daily_agents" PRIMARY KEY ("day", "package", "user_agent", "repo")
    `);
    await queryRunner.query(`CREATE INDEX "router_hits_daily_agents_repo_idx" ON "router_hits_daily_agents" ("repo")`);

    await queryRunner.query(`
      DELETE FROM "router_hits_daily"
      WHERE "day" >= ${ROLLUP_WINDOW_START}
    `);
    await queryRunner.query(`
      INSERT INTO "router_hits_daily" ("day", "country", "hostname", "package", "repo", "count")
      SELECT
        DATE_TRUNC('day', "timestamp" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
        "country",
        "hostname",
        "package",
        "repo",
        COUNT(*)::bigint
      FROM "router-hits"
      WHERE "timestamp" >= ${ROLLUP_WINDOW_START}
      GROUP BY 1, 2, 3, 4, 5
      ON CONFLICT ("day", "country", "hostname", "package", "repo")
      DO UPDATE SET "count" = EXCLUDED."count"
    `);

    await queryRunner.query(`
      DELETE FROM "router_hits_daily_agents"
      WHERE "day" >= ${ROLLUP_WINDOW_START}
    `);
    await queryRunner.query(`
      INSERT INTO "router_hits_daily_agents" ("day", "package", "user_agent", "repo", "count")
      SELECT
        DATE_TRUNC('day', "timestamp" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
        "package",
        COALESCE("user-agent", ''),
        "repo",
        COUNT(*)::bigint
      FROM "router-hits"
      WHERE "timestamp" >= ${ROLLUP_WINDOW_START}
      GROUP BY 1, 2, 3, 4
      ON CONFLICT ("day", "package", "user_agent", "repo")
      DO UPDATE SET "count" = EXCLUDED."count"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "router_hits_daily_agents"
      DROP CONSTRAINT "PK_router_hits_daily_agents"
    `);
    await queryRunner.query(`ALTER TABLE "router_hits_daily_agents" DROP COLUMN "repo"`);
    await queryRunner.query(`
      ALTER TABLE "router_hits_daily_agents"
      ADD CONSTRAINT "PK_router_hits_daily_agents" PRIMARY KEY ("day", "package", "user_agent")
    `);
    await queryRunner.query(`DROP INDEX "router_hits_daily_agents_repo_idx"`);

    await queryRunner.query(`
      ALTER TABLE "router_hits_daily"
      DROP CONSTRAINT "PK_router_hits_daily"
    `);
    await queryRunner.query(`ALTER TABLE "router_hits_daily" DROP COLUMN "repo"`);
    await queryRunner.query(`
      ALTER TABLE "router_hits_daily"
      ADD CONSTRAINT "PK_router_hits_daily" PRIMARY KEY ("day", "country", "hostname", "package")
    `);
    await queryRunner.query(`DROP INDEX "router_hits_daily_repo_idx"`);
  }
}
