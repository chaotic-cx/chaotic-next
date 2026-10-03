import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBuildPkgbaseStatusIndex1791017025764 implements MigrationInterface {
  name = 'AddBuildPkgbaseStatusIndex1791017025764';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX "IDX_build_pkgbaseId_status_id" ON "build" ("pkgbaseId", "status", "id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_build_pkgbaseId_status_id"`);
  }
}
