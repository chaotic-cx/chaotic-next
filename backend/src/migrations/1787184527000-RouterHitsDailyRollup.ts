import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pre-aggregated daily router metrics. The raw `router-hits` log is retained
 * only briefly before being purged, so these rollup tables carry the long-lived
 * per-day history used by the dashboard. A scheduled job keeps them current.
 */
export class RouterHitsDailyRollup1787184527000 implements MigrationInterface {
  name = 'RouterHitsDailyRollup1787184527000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "router_hits_daily" (
        "day" timestamp NOT NULL,
        "country" character(2) NOT NULL,
        "hostname" text NOT NULL,
        "package" text NOT NULL,
        "count" bigint NOT NULL,
        CONSTRAINT "PK_router_hits_daily" PRIMARY KEY ("day", "country", "hostname", "package")
      )
    `);
    await queryRunner.query(`CREATE INDEX "router_hits_daily_day_idx" ON "router_hits_daily" ("day")`);
    await queryRunner.query(`CREATE INDEX "router_hits_daily_package_idx" ON "router_hits_daily" ("package")`);

    await queryRunner.query(`
      CREATE TABLE "router_hits_daily_agents" (
        "day" timestamp NOT NULL,
        "package" text NOT NULL,
        "user_agent" text NOT NULL,
        "count" bigint NOT NULL,
        CONSTRAINT "PK_router_hits_daily_agents" PRIMARY KEY ("day", "package", "user_agent")
      )
    `);
    await queryRunner.query(`CREATE INDEX "router_hits_daily_agents_day_idx" ON "router_hits_daily_agents" ("day")`);

    await queryRunner.query(`
      INSERT INTO "router_hits_daily" ("day", "country", "hostname", "package", "count")
      SELECT
        DATE_TRUNC('day', "timestamp" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
        "country",
        "hostname",
        "package",
        COUNT(*)::bigint
      FROM "router-hits"
      GROUP BY 1, 2, 3, 4
    `);

    await queryRunner.query(`
      INSERT INTO "router_hits_daily_agents" ("day", "package", "user_agent", "count")
      SELECT
        DATE_TRUNC('day', "timestamp" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
        "package",
        COALESCE("user-agent", ''),
        COUNT(*)::bigint
      FROM "router-hits"
      GROUP BY 1, 2, 3
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "router_hits_daily_agents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "router_hits_daily"`);
  }
}
