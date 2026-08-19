import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Removes stale inactive rows that merely duplicate an active package in
 * another repo (e.g. garuda rows left over from when garuda mirrored the
 * chaotic-aur DB). Only version-less rows with no build history are removed so
 * genuine removal history and any build records are preserved.
 */
export class CleanupDuplicateInactiveRows1787149556087 implements MigrationInterface {
  name = 'CleanupDuplicateInactiveRows1787149556087';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "package" g
       WHERE g."isActive" = false
         AND g.version IS NULL
         AND NOT EXISTS (SELECT 1 FROM "build" b WHERE b."pkgbaseId" = g.id)
         AND EXISTS (
           SELECT 1 FROM "package" c
           WHERE c.pkgname = g.pkgname AND c."repoId" <> g."repoId" AND c."isActive" = true
         )`,
    );
  }

  public async down(): Promise<void> {
    // Deleting spurious rows is not reversible.
  }
}
