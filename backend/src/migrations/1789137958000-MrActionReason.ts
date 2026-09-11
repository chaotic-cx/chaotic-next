import { MigrationInterface, QueryRunner } from 'typeorm';

export class MrActionReason1789137958000 implements MigrationInterface {
  name = 'MrActionReason1789137958000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "mr_action" ADD "reason" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "mr_action" DROP COLUMN "reason"`);
  }
}
