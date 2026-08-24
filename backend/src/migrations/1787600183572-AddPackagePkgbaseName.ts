import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPackagePkgbaseName1787600183572 implements MigrationInterface {
  name = 'AddPackagePkgbaseName1787600183572';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package" ADD COLUMN "pkgbaseName" character varying NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package" DROP COLUMN "pkgbaseName"`);
  }
}
