import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Moves isSourceCompiled from the analyses to the package, and adds the
 * per-reason fixability. Rows from before this migration get an empty
 * as-built list: their first scan is unknown, so no reason counts as built in.
 */
export class AddBrokenFixability1792001573016 implements MigrationInterface {
  name = 'AddBrokenFixability1792001573016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package" ADD "isSourceCompiled" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`
      UPDATE "package" p
      SET "isSourceCompiled" = latest."isSourceCompiled"
      FROM (
        SELECT DISTINCT ON ("pkgId") "pkgId", "isSourceCompiled"
        FROM "package_elf_analysis"
        WHERE "pkgType" = '1'
        ORDER BY "pkgId", "scannedAt" DESC
      ) latest
      WHERE latest."pkgId" = p."id"
    `);
    await queryRunner.query(`ALTER TABLE "package_elf_analysis" DROP COLUMN "isSourceCompiled"`);

    await queryRunner.query(`ALTER TABLE "package_elf_analysis" ADD "brokenIssues" jsonb NOT NULL DEFAULT '[]'`);
    await queryRunner.query(`ALTER TABLE "package_elf_analysis" ADD "brokenReasonsAsBuilt" jsonb`);
    await queryRunner.query(`UPDATE "package_elf_analysis" SET "brokenReasonsAsBuilt" = '[]'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package_elf_analysis" DROP COLUMN "brokenReasonsAsBuilt"`);
    await queryRunner.query(`ALTER TABLE "package_elf_analysis" DROP COLUMN "brokenIssues"`);

    await queryRunner.query(`ALTER TABLE "package_elf_analysis" ADD "isSourceCompiled" boolean DEFAULT false`);
    await queryRunner.query(`
      UPDATE "package_elf_analysis" a
      SET "isSourceCompiled" = p."isSourceCompiled"
      FROM "package" p
      WHERE a."pkgType" = '1' AND a."pkgId" = p."id"
    `);
    await queryRunner.query(`ALTER TABLE "package" DROP COLUMN "isSourceCompiled"`);
  }
}
