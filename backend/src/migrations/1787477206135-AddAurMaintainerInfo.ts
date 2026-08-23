import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAurMaintainerInfo1787477206135 implements MigrationInterface {
  name = 'AddAurMaintainerInfo1787477206135';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS aur_maintainer_info (
        username VARCHAR(255) PRIMARY KEY,
        "registeredDate" TIMESTAMP NOT NULL,
        "fetchedAt" BIGINT NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_aur_maintainer_info_username
      ON aur_maintainer_info(username)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_aur_maintainer_info_username`);
    await queryRunner.query(`DROP TABLE IF EXISTS aur_maintainer_info`);
  }
}
