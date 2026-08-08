import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1786209704833 implements MigrationInterface {
  name = 'InitialSchema1786209704833';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "builder" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "description" character varying, "builderClass" character varying, "isActive" boolean, "lastActive" TIMESTAMP, CONSTRAINT "PK_2e6f1c5fca79364a330f7e8b2a7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "repo" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "repoUrl" character varying, "isActive" boolean NOT NULL DEFAULT true, "status" integer, "gitRef" character varying NOT NULL DEFAULT 'main', "dbPath" character varying, "apiToken" character varying, CONSTRAINT "PK_6c3318a15f9a297481f341128cf" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "package" ("id" SERIAL NOT NULL, "pkgname" character varying NOT NULL, "lastUpdated" TIMESTAMP, "isActive" boolean NOT NULL DEFAULT true, "version" character varying, "bumpCount" integer, "bumpTriggers" jsonb, "metadata" jsonb, "pkgrel" integer, "namcapAnalysis" jsonb, "repoId" integer, CONSTRAINT "PK_308364c66df656295bc4ec467c2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE TYPE "public"."build_status_enum" AS ENUM('0', '1', '2', '3', '4', '5', '6', '7')`);
    await queryRunner.query(
      `CREATE TABLE "build" ("id" SERIAL NOT NULL, "buildClass" character varying, "status" "public"."build_status_enum" NOT NULL DEFAULT '0', "timestamp" TIMESTAMP NOT NULL DEFAULT now(), "arch" character varying, "logUrl" character varying, "commit" character varying, "timeToEnd" double precision, "replaced" boolean, "pkgbaseId" integer, "builderId" integer, "repoId" integer, CONSTRAINT "PK_5625549365ffbf46dd1c7ff342d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "archlinux_package" ("id" SERIAL NOT NULL, "pkgname" character varying NOT NULL, "version" character varying, "pkgrel" integer, "arch" character varying, "lastUpdated" TIMESTAMP, "previousVersion" character varying, "metadata" jsonb, CONSTRAINT "PK_04d3cb5ed1fd844001395ae4ded" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "repo_manager_settings" ("id" SERIAL NOT NULL, "key" character varying NOT NULL, "value" character varying NOT NULL, CONSTRAINT "PK_87444353d3bd4ccb3df6302fba5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE TYPE "public"."package_bump_bumptype_enum" AS ENUM('0', '1', '2', '3', '4')`);
    await queryRunner.query(`CREATE TYPE "public"."package_bump_triggerfrom_enum" AS ENUM('0', '1')`);
    await queryRunner.query(
      `CREATE TABLE "package_bump" ("id" SERIAL NOT NULL, "bumpType" "public"."package_bump_bumptype_enum" NOT NULL, "trigger" integer NOT NULL, "triggerFrom" "public"."package_bump_triggerfrom_enum" NOT NULL, "timestamp" TIMESTAMP NOT NULL DEFAULT now(), "pkgId" integer, CONSTRAINT "PK_37554c2f2aa2ffa2cfcfd155f71" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE TYPE "public"."user_status_enum" AS ENUM('0', '1')`);
    await queryRunner.query(
      `CREATE TABLE "user" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "password" character varying, "mail" character varying, "status" "public"."user_status_enum" NOT NULL DEFAULT '0', CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "query-result-cache" ("id" SERIAL NOT NULL, "identifier" character varying, "time" bigint NOT NULL, "duration" integer NOT NULL, "query" text NOT NULL, "result" text NOT NULL, CONSTRAINT "PK_6a98f758d8bfd010e7e10ffd3d3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "router-hits" ("package" text NOT NULL, "version" text NOT NULL, "repo" text NOT NULL, "arch" text NOT NULL, "hostname" text NOT NULL, "ip" inet NOT NULL, "country" character(2) NOT NULL, "user-agent" text, "timestamp" timestamp NOT NULL)`,
    );
    await queryRunner.query(`CREATE INDEX "router_hits_timestamp_idx" ON "router-hits" ("timestamp")`);
    await queryRunner.query(
      `ALTER TABLE "package" ADD CONSTRAINT "FK_5f9df905bcdaade4c350004d802" FOREIGN KEY ("repoId") REFERENCES "repo"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "build" ADD CONSTRAINT "FK_72003394c4de57257a91a5681ed" FOREIGN KEY ("pkgbaseId") REFERENCES "package"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "build" ADD CONSTRAINT "FK_d32c0e74161e1950227be327ced" FOREIGN KEY ("builderId") REFERENCES "builder"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "build" ADD CONSTRAINT "FK_f3a6563cc5d8b18f1c31b24ebde" FOREIGN KEY ("repoId") REFERENCES "repo"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "package_bump" ADD CONSTRAINT "FK_df3634e6a4eee49e162e213eb2c" FOREIGN KEY ("pkgId") REFERENCES "package"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package_bump" DROP CONSTRAINT "FK_df3634e6a4eee49e162e213eb2c"`);
    await queryRunner.query(`ALTER TABLE "build" DROP CONSTRAINT "FK_f3a6563cc5d8b18f1c31b24ebde"`);
    await queryRunner.query(`ALTER TABLE "build" DROP CONSTRAINT "FK_d32c0e74161e1950227be327ced"`);
    await queryRunner.query(`ALTER TABLE "build" DROP CONSTRAINT "FK_72003394c4de57257a91a5681ed"`);
    await queryRunner.query(`ALTER TABLE "package" DROP CONSTRAINT "FK_5f9df905bcdaade4c350004d802"`);
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP TYPE "public"."user_status_enum"`);
    await queryRunner.query(`DROP TABLE "package_bump"`);
    await queryRunner.query(`DROP TYPE "public"."package_bump_triggerfrom_enum"`);
    await queryRunner.query(`DROP TYPE "public"."package_bump_bumptype_enum"`);
    await queryRunner.query(`DROP TABLE "repo_manager_settings"`);
    await queryRunner.query(`DROP TABLE "archlinux_package"`);
    await queryRunner.query(`DROP TABLE "build"`);
    await queryRunner.query(`DROP TYPE "public"."build_status_enum"`);
    await queryRunner.query(`DROP TABLE "package"`);
    await queryRunner.query(`DROP TABLE "repo"`);
    await queryRunner.query(`DROP TABLE "builder"`);
    await queryRunner.query(`DROP INDEX "router_hits_timestamp_idx"`);
    await queryRunner.query(`DROP TABLE "router-hits"`);
    await queryRunner.query(`DROP TABLE "query-result-cache"`);
  }
}
