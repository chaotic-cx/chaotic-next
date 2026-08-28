import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enforce at the database level what EntityLookupService relies on instead of
 * in-process mutexes: builder and repo names are unique, and a package name is
 * unique per repo.
 */
export class UniqueEntityNames1787949377345 implements MigrationInterface {
  name = 'UniqueEntityNames1787949377345';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_builder_name"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_builder_name" ON "builder" ("name")`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_repo_name"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_repo_name" ON "repo" ("name")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_package_repo_pkgname" ON "package" ("repoId", "pkgname")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_package_repo_pkgname"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_repo_name"`);
    await queryRunner.query(`CREATE INDEX "IDX_repo_name" ON "repo" ("name")`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_builder_name"`);
    await queryRunner.query(`CREATE INDEX "IDX_builder_name" ON "builder" ("name")`);
  }
}
