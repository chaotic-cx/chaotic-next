import { type MigrationInterface, type QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAccount1786779403609 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'account',
        columns: [
          {
            name: 'id',
            type: 'text',
            isPrimary: true,
          },
          {
            name: 'accountId',
            type: 'text',
          },
          {
            name: 'providerId',
            type: 'text',
          },
          {
            name: 'userId',
            type: 'text',
          },
          {
            name: 'accessToken',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'refreshToken',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'idToken',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'accessTokenExpiresAt',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'refreshTokenExpiresAt',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'scope',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'password',
            type: 'text',
            isNullable: true,
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
        ],
      }),
    );

    await queryRunner.createIndex(
      'account',
      new TableIndex({
        name: 'account_userId_idx',
        columnNames: ['userId'],
      }),
    );

    await queryRunner.createForeignKey(
      'account',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('account');
  }
}
