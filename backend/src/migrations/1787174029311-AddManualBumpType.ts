import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddManualBumpType1787174029311 implements MigrationInterface {
  name = 'AddManualBumpType1787174029311';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "public"."package_bump_bumptype_enum" ADD VALUE '8'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "package_bump" WHERE "bumpType" = '8'`);
  }
}
