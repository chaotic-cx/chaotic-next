import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAnalysisBrokenSince1790959740748 implements MigrationInterface {
  name = 'AddAnalysisBrokenSince1790959740748';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package_elf_analysis" ADD "brokenSince" TIMESTAMP`);
    await queryRunner.query(`UPDATE "package_elf_analysis" SET "brokenSince" = "scannedAt" WHERE "broken"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package_elf_analysis" DROP COLUMN "brokenSince"`);
  }
}
