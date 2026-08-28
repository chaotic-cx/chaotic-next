import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddAccountIssuer1787942324294 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "issuer" text`);
    // Better Auth 1.7 scopes account identity by issuer. Existing rows were
    // created before the column existed, so backfill from providerId using the
    // same synthetic issuers Better Auth derives (local:credential for
    // password accounts, local:oauth:<providerId> for OAuth accounts).
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "account_issuer_accountId_uq"`);
    await queryRunner.query(`ALTER TABLE "account" DROP COLUMN IF EXISTS "issuer"`);
  }
}
