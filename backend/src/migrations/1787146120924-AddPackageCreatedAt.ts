import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPackageCreatedAt1787146120924 implements MigrationInterface {
  name = 'AddPackageCreatedAt1787146120924';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package" ADD COLUMN "createdAt" TIMESTAMP`);
    // Backfill from the first recorded build for each package, which best
    // approximates when the package was added to the repository. Packages with
    // no build history are left NULL (excluded from additions-over-time).
    await queryRunner.query(
      `UPDATE "package" p
       SET "createdAt" = (
         SELECT MIN(b."timestamp")
         FROM "build" b
         WHERE b."pkgbaseId" = p."id"
       )
       WHERE EXISTS (SELECT 1 FROM "build" b WHERE b."pkgbaseId" = p."id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package" DROP COLUMN "createdAt"`);
  }
}
