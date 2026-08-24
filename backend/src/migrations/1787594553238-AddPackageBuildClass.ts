import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPackageBuildClass1787594553238 implements MigrationInterface {
  name = 'AddPackageBuildClass1787594553238';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package" ADD COLUMN "buildClass" integer NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package" DROP COLUMN "buildClass"`);
  }
}
