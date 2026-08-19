import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPackageBump1787139892583 implements MigrationInterface {
  name = 'AddPackageBump1787139892583';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package" ADD COLUMN "bump" integer NOT NULL DEFAULT 0`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package" DROP COLUMN "bump"`);
  }
}
