import type { BuildResourceStats, DiffScanFinding, VtIndicatorReport } from '@chaotic-next/shared-lib';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type PortableBuildStatus = 'queued' | 'cloning' | 'building' | 'success' | 'failed' | 'timed-out';

export const PORTABLE_BUILD_ACTIVE_STATUSES: PortableBuildStatus[] = ['queued', 'cloning', 'building'];
export const PORTABLE_BUILD_STATUSES: PortableBuildStatus[] = [
  ...PORTABLE_BUILD_ACTIVE_STATUSES,
  'success',
  'failed',
  'timed-out',
];

export interface PortableArtifactScan {
  status: 'clean' | 'findings' | 'failed';
  scannedFiles: number;
  findings: DiffScanFinding[];
  virusTotal: VtIndicatorReport[];
  clamavDetections?: { file: string; signature: string }[];
}

@Entity('portable_build')
@Index('IDX_portable_build_status', ['status'])
@Index('IDX_portable_build_pkgbase', ['pkgbase'])
export class PortableBuild {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar' })
  pkgbase!: string;

  @Column({ type: 'varchar' })
  status!: PortableBuildStatus;

  @Column({ type: 'integer', nullable: true })
  issueNumber!: number | null;

  @Column({ type: 'text', nullable: true })
  log!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  artifacts!: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  resourceStats!: BuildResourceStats | null;

  @Column({ type: 'jsonb', nullable: true })
  scan!: PortableArtifactScan | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  finishedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
