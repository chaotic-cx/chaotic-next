import { type ScanIndicatorType } from './indicators';
import { type VtEngineStats, type VtVerdict } from '@chaotic-next/shared-lib';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('virus_total_verdict')
@Index('IDX_vt_verdict_indicator', ['type', 'value'], { unique: true })
export class VirusTotalVerdict {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar' })
  type!: ScanIndicatorType;

  @Column({ type: 'varchar' })
  value!: string;

  @Column({ type: 'varchar' })
  context!: string;

  @Column({ type: 'varchar' })
  verdict!: VtVerdict;

  @Column({ type: 'int', nullable: true })
  malicious!: number | null;

  @Column({ type: 'int', nullable: true })
  suspicious!: number | null;

  @Column({ type: 'int', nullable: true })
  undetected!: number | null;

  @Column({ type: 'int', nullable: true })
  harmless!: number | null;

  @Column({ type: 'int', nullable: true })
  timeout!: number | null;

  @CreateDateColumn()
  createdAt!: Date;
}

export function statsToColumns(stats: VtEngineStats): {
  malicious: number;
  suspicious: number;
  undetected: number;
  harmless: number;
  timeout: number;
} {
  return {
    malicious: stats.malicious,
    suspicious: stats.suspicious,
    undetected: stats.undetected,
    harmless: stats.harmless,
    timeout: stats.timeout,
  };
}
