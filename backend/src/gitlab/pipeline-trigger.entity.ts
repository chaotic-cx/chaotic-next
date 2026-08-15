import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Audit row for every pipeline triggered through the API, mirroring MrAction. */
@Entity('pipeline_trigger')
export class PipelineTrigger {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index('IDX_pipeline_trigger_pipelineId')
  @Column({ type: 'int', nullable: true })
  pipelineId!: number | null;

  @Column({ type: 'varchar' })
  ref!: string;

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
