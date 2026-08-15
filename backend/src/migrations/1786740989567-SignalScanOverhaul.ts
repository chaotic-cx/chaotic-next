import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Consolidated follow-up to the initial schema (replaces interim migrations):
 * adds `package_elf_analysis` for ELF signal scanning, moves push subscriptions
 * into a table, drops the `user` and `repo_manager_settings` tables, adds
 * `repo.gitlabProjectId` / `package.skipSignalScan`, and backfills missing FK
 * and pkgname indexes. Only applies to databases built from the initial schema.
 */
export class SignalScanOverhaul1786740989567 implements MigrationInterface {
  name = 'SignalScanOverhaul1786740989567';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package" DROP COLUMN "namcapAnalysis"`);
    await queryRunner.query(`ALTER TABLE "package" ADD COLUMN "skipSignalScan" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "package_bump" ADD "details" jsonb`);
    await queryRunner.query(`ALTER TYPE "public"."package_bump_bumptype_enum" ADD VALUE '6'`);
    await queryRunner.query(`ALTER TYPE "public"."package_bump_bumptype_enum" ADD VALUE '7'`);
    await queryRunner.query(`CREATE TYPE "public"."package_elf_analysis_pkgtype_enum" AS ENUM('0', '1')`);
    await queryRunner.query(
      `CREATE TABLE "package_elf_analysis" ("id" SERIAL NOT NULL, "pkgType" "public"."package_elf_analysis_pkgtype_enum" NOT NULL, "pkgId" integer NOT NULL, "version" character varying NOT NULL, "files" jsonb NOT NULL DEFAULT '[]', "neededSonames" jsonb NOT NULL DEFAULT '[]', "providedSonames" jsonb NOT NULL DEFAULT '[]', "importedSymbols" jsonb NOT NULL DEFAULT '[]', "exportedSymbols" jsonb NOT NULL DEFAULT '{}', "vtables" jsonb NOT NULL DEFAULT '{}', "directoriesOwned" jsonb NOT NULL DEFAULT '[]', "directDirectories" jsonb NOT NULL DEFAULT '[]', "pluginOf" jsonb NOT NULL DEFAULT '[]', "broken" boolean NOT NULL DEFAULT false, "brokenReasons" jsonb NOT NULL DEFAULT '[]', "scannedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_pkg_elf_analysis" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "PK_pkg_elf_analysis_uniq" ON "package_elf_analysis" ("pkgType", "pkgId", "version")`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "user"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."user_status_enum"`);
    await queryRunner.query(
      `CREATE TABLE "notification_subscription" ("id" SERIAL NOT NULL, "endpoint" character varying NOT NULL, "p256dh" character varying NOT NULL, "auth" character varying NOT NULL, "expirationTime" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_notification_subscription" PRIMARY KEY ("id"), CONSTRAINT "UQ_notification_subscription_endpoint" UNIQUE ("endpoint"))`,
    );
    await queryRunner.query(`ALTER TABLE "repo" ADD COLUMN "gitlabProjectId" varchar`);
    await queryRunner.query(`DROP TABLE IF EXISTS "repo_manager_settings"`);
    await queryRunner.query(`CREATE INDEX "IDX_archlinux_package_pkgname" ON "archlinux_package" ("pkgname")`);
    await queryRunner.query(`CREATE INDEX "IDX_package_pkgname" ON "package" ("pkgname")`);
    await queryRunner.query(`CREATE INDEX "IDX_package_active" ON "package" ("isActive") WHERE "isActive" = true`);
    await queryRunner.query(`CREATE INDEX "IDX_package_repoId" ON "package" ("repoId")`);
    await queryRunner.query(`CREATE INDEX "IDX_repo_name" ON "repo" ("name")`);
    await queryRunner.query(`CREATE INDEX "IDX_builder_name" ON "builder" ("name")`);
    await queryRunner.query(`CREATE INDEX "IDX_package_bump_pkgId" ON "package_bump" ("pkgId")`);
    await queryRunner.query(`CREATE INDEX "IDX_package_bump_timestamp" ON "package_bump" ("timestamp")`);
    await queryRunner.query(`CREATE INDEX "IDX_build_pkgbaseId" ON "build" ("pkgbaseId")`);
    await queryRunner.query(`CREATE INDEX "IDX_build_builderId" ON "build" ("builderId")`);
    await queryRunner.query(`CREATE INDEX "IDX_build_repoId" ON "build" ("repoId")`);
    await queryRunner.query(`CREATE INDEX "IDX_build_timestamp" ON "build" ("timestamp")`);
    await queryRunner.query(`CREATE INDEX "IDX_build_status" ON "build" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_build_status"`);
    await queryRunner.query(`DROP INDEX "IDX_build_timestamp"`);
    await queryRunner.query(`DROP INDEX "IDX_build_repoId"`);
    await queryRunner.query(`DROP INDEX "IDX_build_builderId"`);
    await queryRunner.query(`DROP INDEX "IDX_build_pkgbaseId"`);
    await queryRunner.query(`DROP INDEX "IDX_package_bump_timestamp"`);
    await queryRunner.query(`DROP INDEX "IDX_package_bump_pkgId"`);
    await queryRunner.query(`DROP INDEX "IDX_builder_name"`);
    await queryRunner.query(`DROP INDEX "IDX_repo_name"`);
    await queryRunner.query(`DROP INDEX "IDX_package_repoId"`);
    await queryRunner.query(`DROP INDEX "IDX_package_active"`);
    await queryRunner.query(`DROP INDEX "IDX_package_pkgname"`);
    await queryRunner.query(`DROP INDEX "IDX_archlinux_package_pkgname"`);
    await queryRunner.query(
      `CREATE TABLE "repo_manager_settings" ("id" SERIAL NOT NULL, "key" character varying NOT NULL, "value" character varying NOT NULL, CONSTRAINT "PK_87444353d3bd4ccb3df6302fba5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`ALTER TABLE "repo" DROP COLUMN "gitlabProjectId"`);
    await queryRunner.query(`DROP TABLE "notification_subscription"`);
    await queryRunner.query(`CREATE TYPE "public"."user_status_enum" AS ENUM('0', '1')`);
    await queryRunner.query(
      `CREATE TABLE "user" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "password" character varying, "mail" character varying, "status" "public"."user_status_enum" NOT NULL DEFAULT '0', CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`DROP TABLE "package_elf_analysis"`);
    await queryRunner.query(`DROP TYPE "public"."package_elf_analysis_pkgtype_enum"`);
    await queryRunner.query(`ALTER TABLE "package_bump" DROP COLUMN "details"`);
    await queryRunner.query(`ALTER TABLE "package" DROP COLUMN "skipSignalScan"`);
    await queryRunner.query(`ALTER TABLE "package" ADD "namcapAnalysis" jsonb`);
  }
}
