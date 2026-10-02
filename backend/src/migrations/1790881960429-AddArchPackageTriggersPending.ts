import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArchPackageTriggersPending1790881960429 implements MigrationInterface {
  name = 'AddArchPackageTriggersPending1790881960429';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "archlinux_package" ADD "triggersPending" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(
      `CREATE INDEX "IDX_archlinux_package_triggersPending" ON "archlinux_package" ("triggersPending") WHERE "triggersPending"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_archlinux_package_triggersPending"`);
    await queryRunner.query(`ALTER TABLE "archlinux_package" DROP COLUMN "triggersPending"`);
  }
}
