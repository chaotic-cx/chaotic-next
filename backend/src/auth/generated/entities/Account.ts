import { User } from './User';
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

@Entity('account')
export class Account {
  @PrimaryColumn('text')
  id!: string;

  @Column('text', { name: 'accountId' })
  accountId!: string;

  @Column('text', { name: 'providerId' })
  providerId!: string;

  @Index('account_userId_idx')
  @Column('text', { name: 'userId' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId', referencedColumnName: 'id' })
  user!: User;

  @Column('text', { name: 'accessToken', nullable: true })
  accessToken!: string | null;

  @Column('text', { name: 'refreshToken', nullable: true })
  refreshToken!: string | null;

  @Column('text', { name: 'idToken', nullable: true })
  idToken!: string | null;

  @Column('timestamptz', { name: 'accessTokenExpiresAt', nullable: true })
  accessTokenExpiresAt!: Date | null;

  @Column('timestamptz', { name: 'refreshTokenExpiresAt', nullable: true })
  refreshTokenExpiresAt!: Date | null;

  @Column('text', { name: 'scope', nullable: true })
  scope!: string | null;

  @Column('text', { name: 'password', nullable: true })
  password!: string | null;

  @Column('timestamptz', { name: 'createdAt', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updatedAt' })
  updatedAt!: Date;
}
