import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AurScanSource = 'anonymous' | 'authorized' | 'automated';

@Entity('aur_scan_metric')
@Index('IDX_aur_scan_metric_source', ['source'])
@Index('IDX_aur_scan_metric_created', ['createdAt'])
export class AurScanMetric {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar' })
  packageName!: string;

  @Column({ type: 'varchar' })
  source!: AurScanSource;

  @CreateDateColumn()
  createdAt!: Date;
}
