import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('user')
export class User {
  @PrimaryColumn('text')
  id!: string;

  @Column('text', { name: 'name' })
  name!: string;

  @Column('text', { name: 'email', unique: true })
  email!: string;

  @Column('boolean', { name: 'emailVerified', default: false })
  emailVerified!: boolean;

  @Column('text', { name: 'image', nullable: true })
  image!: string | null;

  @Column('timestamptz', { name: 'createdAt', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updatedAt', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
