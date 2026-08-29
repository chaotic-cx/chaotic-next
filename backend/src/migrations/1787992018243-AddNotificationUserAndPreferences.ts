import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationUserAndPreferences1787992018243 implements MigrationInterface {
  name = 'AddNotificationUserAndPreferences1787992018243';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rows from before user linkage carry no owner and cannot be attributed.
    await queryRunner.query(`DELETE FROM "notification_subscription"`);
    await queryRunner.query(`ALTER TABLE "notification_subscription" ADD COLUMN "userId" varchar NOT NULL`);
    await queryRunner.query(
      `CREATE TABLE "notification_preference" (
        "id" SERIAL NOT NULL,
        "userId" varchar NOT NULL,
        "type" varchar NOT NULL,
        "enabled" boolean NOT NULL,
        CONSTRAINT "PK_notification_preference" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_preference_userId" ON "notification_preference" ("userId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_notification_preference_user_type" ON "notification_preference" ("userId", "type")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_notification_preference_user_type"`);
    await queryRunner.query(`DROP INDEX "IDX_notification_preference_userId"`);
    await queryRunner.query(`DROP TABLE "notification_preference"`);
    await queryRunner.query(`ALTER TABLE "notification_subscription" DROP COLUMN "userId"`);
  }
}
