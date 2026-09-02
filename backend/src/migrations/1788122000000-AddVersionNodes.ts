import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVersionNodes1788122000000 implements MigrationInterface {
  name = 'AddVersionNodes1788122000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package_elf_analysis" ADD COLUMN "providedVersionNodes" jsonb DEFAULT '{}'`);
    await queryRunner.query(`ALTER TABLE "package_elf_analysis" ADD COLUMN "neededVersionNodes" jsonb DEFAULT '{}'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package_elf_analysis" DROP COLUMN "neededVersionNodes"`);
    await queryRunner.query(`ALTER TABLE "package_elf_analysis" DROP COLUMN "providedVersionNodes"`);
  }
}
