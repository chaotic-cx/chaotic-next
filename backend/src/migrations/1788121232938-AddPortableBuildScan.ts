import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPortableBuildScan1788121232938 implements MigrationInterface {
  name = 'AddPortableBuildScan1788121232938';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "portable_build" ADD COLUMN "scan" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "portable_build" DROP COLUMN "scan"`);
  }
}
