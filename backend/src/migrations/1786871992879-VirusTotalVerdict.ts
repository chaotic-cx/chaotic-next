import { MigrationInterface, QueryRunner } from 'typeorm';

export class VirusTotalVerdict1786871992879 implements MigrationInterface {
  name = 'VirusTotalVerdict1786871992879';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "virus_total_verdict" ("id" SERIAL NOT NULL, "type" character varying NOT NULL, "value" character varying NOT NULL, "context" character varying NOT NULL, "verdict" character varying NOT NULL, "malicious" integer, "suspicious" integer, "undetected" integer, "harmless" integer, "timeout" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_virus_total_verdict" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_vt_verdict_indicator" ON "virus_total_verdict" ("type", "value")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "virus_total_verdict"`);
  }
}
