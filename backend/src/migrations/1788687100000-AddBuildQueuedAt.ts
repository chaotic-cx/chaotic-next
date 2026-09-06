import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBuildQueuedAt1788687100000 implements MigrationInterface {
  name = 'AddBuildQueuedAt1788687100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "build" ADD COLUMN "queuedAt" bigint`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "build" DROP COLUMN "queuedAt"`);
  }
}
