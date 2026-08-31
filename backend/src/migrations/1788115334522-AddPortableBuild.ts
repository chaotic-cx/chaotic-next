import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPortableBuild1788115334522 implements MigrationInterface {
  name = 'AddPortableBuild1788115334522';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "portable_build" ("id" SERIAL NOT NULL, "pkgbase" character varying NOT NULL, "status" character varying NOT NULL, "issueNumber" integer, "log" text, "artifacts" jsonb, "resourceStats" jsonb, "error" text, "startedAt" TIMESTAMP, "finishedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_portable_build" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_portable_build_status" ON "portable_build" ("status") `);
    await queryRunner.query(`CREATE INDEX "IDX_portable_build_pkgbase" ON "portable_build" ("pkgbase") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_portable_build_pkgbase"`);
    await queryRunner.query(`DROP INDEX "IDX_portable_build_status"`);
    await queryRunner.query(`DROP TABLE "portable_build"`);
  }
}
