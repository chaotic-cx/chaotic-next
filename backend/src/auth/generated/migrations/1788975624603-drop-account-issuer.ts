import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class DropAccountIssuer1788975624603 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "account_issuer_accountId_uq"`);
    await queryRunner.query(`ALTER TABLE "account" DROP COLUMN IF EXISTS "issuer"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "issuer" text`);
    await queryRunner.query(`
      UPDATE "account"
      SET "issuer" = CASE
        WHEN "providerId" = 'credential' THEN 'local:credential'
        ELSE 'local:oauth:' || "providerId"
      END
      WHERE "issuer" IS NULL
    `);
    await queryRunner.query(`ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "account_issuer_accountId_uq" ON "account" ("issuer", "accountId")`,
    );
  }
}
