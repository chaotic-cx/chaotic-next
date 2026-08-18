import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, type ValueTransformer } from 'typeorm';

const bigintToNumber: ValueTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null => (value === null ? null : Number(value)),
};

/** Audit row for every pipeline triggered through the API, mirroring MrAction. */
@Entity('pipeline_trigger')
export class PipelineTrigger {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index('IDX_pipeline_trigger_pipelineId')
  @Column({ type: 'bigint', nullable: true, transformer: bigintToNumber })
  pipelineId!: number | null;

  @Column({ type: 'varchar' })
  ref!: string;

  @Column({ type: 'varchar', nullable: true })
  commitSha!: string | null;

  @Column({ type: 'varchar' })
  operation!: string;

  @Column({ type: 'jsonb' })
  inputs!: Record<string, string>;

  @Column({ type: 'varchar', nullable: true })
  webUrl!: string | null;

  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'varchar' })
  userName!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
