import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditCommitSha1786999414850 implements MigrationInterface {
  name = 'AuditCommitSha1786999414850';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "mr_action" ADD "commitSha" character varying`);
    await queryRunner.query(`ALTER TABLE "pipeline_trigger" ADD "commitSha" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pipeline_trigger" DROP COLUMN "commitSha"`);
    await queryRunner.query(`ALTER TABLE "mr_action" DROP COLUMN "commitSha"`);
  }
}
