import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPackageRemovedAt1787147034396 implements MigrationInterface {
  name = 'AddPackageRemovedAt1787147034396';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package" ADD COLUMN "removedAt" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package" DROP COLUMN "removedAt"`);
  }
}
