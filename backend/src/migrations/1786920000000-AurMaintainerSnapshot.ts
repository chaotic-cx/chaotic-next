import { MigrationInterface, QueryRunner } from 'typeorm';

export class AurMaintainerSnapshot1786920000000 implements MigrationInterface {
  name = 'AurMaintainerSnapshot1786920000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "aur_maintainer_snapshot" ("id" SERIAL NOT NULL, "packageName" character varying NOT NULL, "maintainers" text array NOT NULL, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_aur_maintainer_snapshot" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_aur_maintainer_snapshot_pkg" ON "aur_maintainer_snapshot" ("packageName")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "aur_maintainer_snapshot"`);
  }
}
