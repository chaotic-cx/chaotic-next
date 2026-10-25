import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBuildLogContent1792924678889 implements MigrationInterface {
  name = 'AddBuildLogContent1792924678889';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "build" ADD COLUMN IF NOT EXISTS "logContent" text NULL`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_build_logContent_timestamp" ON "build" ("timestamp") WHERE "logContent" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_build_logContent_timestamp"`);
    await queryRunner.query(`ALTER TABLE "build" DROP COLUMN IF EXISTS "logContent"`);
  }
}
