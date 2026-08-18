import { MigrationInterface, QueryRunner } from 'typeorm';

export class PipelineIdBigInt1787080648292 implements MigrationInterface {
  name = 'PipelineIdBigInt1787080648292';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pipeline_trigger" ALTER COLUMN "pipelineId" TYPE bigint`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pipeline_trigger" ALTER COLUMN "pipelineId" TYPE integer`);
  }
}
