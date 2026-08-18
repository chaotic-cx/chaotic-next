import { type MigrationInterface, type QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateVerification1786779403609 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'verification',
        columns: [
          {
            name: 'id',
            type: 'text',
            isPrimary: true,
          },
          {
            name: 'identifier',
            type: 'text',
          },
          {
            name: 'value',
            type: 'text',
          },
          {
            name: 'expiresAt',
            type: 'timestamptz',
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
    );

    await queryRunner.createIndex(
      'verification',
      new TableIndex({
        name: 'verification_identifier_idx',
        columnNames: ['identifier'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('verification');
  }
}
