import { MigrationInterface, QueryRunner } from 'typeorm';

export class MrAction1786782432930 implements MigrationInterface {
  name = 'MrAction1786782432930';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "mr_action" ("id" SERIAL NOT NULL, "mergeRequestIid" integer NOT NULL, "action" character varying NOT NULL, "userId" character varying NOT NULL, "userName" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_mr_action" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_mr_action_mergeRequestIid" ON "mr_action" ("mergeRequestIid")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "mr_action"`);
  }
}