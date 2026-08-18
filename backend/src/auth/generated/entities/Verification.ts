import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('verification')
export class Verification {
  @PrimaryColumn('text')
  id!: string;

  @Index('verification_identifier_idx')
  @Column('text', { name: 'identifier' })
  identifier!: string;

  @Column('text', { name: 'value' })
  value!: string;

  @Column('timestamptz', { name: 'expiresAt' })
  expiresAt!: Date;

  @Column('timestamptz', { name: 'createdAt', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updatedAt', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
