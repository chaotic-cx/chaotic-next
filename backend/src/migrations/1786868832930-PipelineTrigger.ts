import { MigrationInterface, QueryRunner } from 'typeorm';

export class PipelineTrigger1786868832930 implements MigrationInterface {
  name = 'PipelineTrigger1786868832930';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "pipeline_trigger" ("id" SERIAL NOT NULL, "pipelineId" integer, "ref" character varying NOT NULL, "operation" character varying NOT NULL, "inputs" jsonb NOT NULL, "webUrl" character varying, "userId" character varying NOT NULL, "userName" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_pipeline_trigger" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_pipeline_trigger_pipelineId" ON "pipeline_trigger" ("pipelineId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "pipeline_trigger"`);
  }
}
