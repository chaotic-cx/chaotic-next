import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHasCompiledCode1787402061455 implements MigrationInterface {
  name = 'AddHasCompiledCode1787402061455';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package_elf_analysis" ADD COLUMN "hasCompiledCode" boolean DEFAULT false`);
    await queryRunner.query(
      `UPDATE "package_elf_analysis"
       SET "hasCompiledCode" = true
       WHERE jsonb_array_length("providedSonames") > 0 OR jsonb_array_length("neededSonames") > 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package_elf_analysis" DROP COLUMN "hasCompiledCode"`);
  }
}
