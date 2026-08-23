import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('diff_scan_rule_data')
export class DiffScanRuleData {
  @PrimaryColumn({ type: 'varchar' })
  cacheKey!: string;

  @Column({ type: 'text' })
  raw!: string;

  @Column({ type: 'timestamptz' })
  fetchedAt!: Date;
}
