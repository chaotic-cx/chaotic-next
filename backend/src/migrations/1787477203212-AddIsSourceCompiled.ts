import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsSourceCompiled1787477203212 implements MigrationInterface {
  name = 'AddIsSourceCompiled1787477203212';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package_elf_analysis" ADD COLUMN "isSourceCompiled" boolean DEFAULT false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package_elf_analysis" DROP COLUMN "isSourceCompiled"`);
  }
}
