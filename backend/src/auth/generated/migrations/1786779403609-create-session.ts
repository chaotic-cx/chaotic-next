import { Table, TableForeignKey, TableIndex, type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateSession1786779403609 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'session',
        columns: [
          {
            name: 'id',
            type: 'text',
            isPrimary: true,
          },
          {
            name: 'expiresAt',
            type: 'timestamptz',
          },
          {
            name: 'token',
            type: 'text',
            isUnique: true,
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamptz',
          },
          {
            name: 'ipAddress',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'userAgent',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'userId',
            type: 'text',
          },
        ],
      }),
    );

    await queryRunner.createIndex(
      'session',
      new TableIndex({
        name: 'session_userId_idx',
        columnNames: ['userId'],
      }),
    );

    await queryRunner.createForeignKey(
      'session',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('session');
  }
}
