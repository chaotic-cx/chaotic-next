import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArchPackageIsActive1788976585794 implements MigrationInterface {
  name = 'AddArchPackageIsActive1788976585794';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "archlinux_package" ADD COLUMN "deactivatedAt" timestamp`);
    await queryRunner.query(
      `CREATE INDEX "IDX_archlinux_package_deactivatedAt" ON "archlinux_package" ("deactivatedAt") WHERE "deactivatedAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_archlinux_package_deactivatedAt"`);
    await queryRunner.query(`ALTER TABLE "archlinux_package" DROP COLUMN "deactivatedAt"`);
  }
}
