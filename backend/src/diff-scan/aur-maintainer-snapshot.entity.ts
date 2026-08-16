import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('aur_maintainer_snapshot')
@Index('IDX_aur_maintainer_snapshot_pkg', ['packageName'], { unique: true })
export class AurMaintainerSnapshot {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar' })
  packageName!: string;

  @Column({ type: 'text', array: true })
  maintainers!: string[];

  @UpdateDateColumn()
  updatedAt!: Date;
}
