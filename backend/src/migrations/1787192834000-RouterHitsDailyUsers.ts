import { MigrationInterface, QueryRunner } from 'typeorm';
import { HLL_LOG2M } from '../utils/constants';

/**
 * One HyperLogLog sketch per UTC day of distinct client IPs. The raw log is
 * purged after a short retention window, so these small sketches preserve the
 * long-lived "unique users" metric without storing any IPs. Merging sketches
 * across days (hll_union_agg) answers the exact unique-user count for any
 * window. Requires the `postgresql-hll` extension on the server.
 */
export class RouterHitsDailyUsers1787192834000 implements MigrationInterface {
  name = 'RouterHitsDailyUsers1787192834000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS hll`);

    await queryRunner.query(`
      CREATE TABLE "router_hits_daily_users" (
        "day" timestamp NOT NULL,
        "sketch" hll NOT NULL,
        CONSTRAINT "PK_router_hits_daily_users" PRIMARY KEY ("day")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "router_hits_daily_users" ("day", "sketch")
      SELECT
        DATE_TRUNC('day', "timestamp" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
        hll_add_agg(hll_hash_text(ip::text), ${HLL_LOG2M})
      FROM "router-hits"
      GROUP BY 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "router_hits_daily_users"`);
  }
}
