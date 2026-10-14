import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArchPackageBump1791900000000 implements MigrationInterface {
  name = 'AddArchPackageBump1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "archlinux_package" ADD "bump" integer NOT NULL DEFAULT 0`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "archlinux_package" DROP COLUMN "bump"`);
  }
}
