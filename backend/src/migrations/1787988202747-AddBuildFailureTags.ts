import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBuildFailureTags1787988202747 implements MigrationInterface {
  name = 'AddBuildFailureTags1787988202747';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "build" ADD COLUMN IF NOT EXISTS "failureTags" jsonb NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "build" DROP COLUMN IF EXISTS "failureTags"`);
  }
}
