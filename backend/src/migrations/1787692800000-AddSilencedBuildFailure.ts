import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSilencedBuildFailure1787692800000 implements MigrationInterface {
  name = 'AddSilencedBuildFailure1787692800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "silenced_build_failure" ("id" SERIAL NOT NULL, "pkgname" character varying NOT NULL, "silencedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_silenced_build_failure" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_silenced_build_failure_pkgname" ON "silenced_build_failure" ("pkgname")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_silenced_build_failure_pkgname"`);
    await queryRunner.query(`DROP TABLE "silenced_build_failure"`);
  }
}
