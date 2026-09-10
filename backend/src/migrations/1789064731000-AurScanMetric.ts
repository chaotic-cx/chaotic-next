import { MigrationInterface, QueryRunner } from 'typeorm';

export class AurScanMetric1789064731000 implements MigrationInterface {
  name = 'AurScanMetric1789064731000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "aur_scan_metric" ("id" SERIAL NOT NULL, "packageName" character varying NOT NULL, "source" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_aur_scan_metric" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_aur_scan_metric_source" ON "aur_scan_metric" ("source")`);
    await queryRunner.query(`CREATE INDEX "IDX_aur_scan_metric_created" ON "aur_scan_metric" ("createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "aur_scan_metric"`);
  }
}
