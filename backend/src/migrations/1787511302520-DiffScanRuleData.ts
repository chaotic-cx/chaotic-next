import { MigrationInterface, QueryRunner } from 'typeorm';

export class DiffScanRuleData1787511302520 implements MigrationInterface {
  name = 'DiffScanRuleData1787511302520';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "diff_scan_rule_data" ("cacheKey" character varying NOT NULL, "raw" text NOT NULL, "fetchedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), CONSTRAINT "PK_diff_scan_rule_data" PRIMARY KEY ("cacheKey"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "diff_scan_rule_data"`);
  }
}
