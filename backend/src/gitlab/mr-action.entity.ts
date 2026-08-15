import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export const MR_ACTIONS = ['approve', 'dangerous', 'hold'] as const;
export type MrActionType = (typeof MR_ACTIONS)[number];

@Entity('mr_action')
export class MrAction {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index('IDX_mr_action_mergeRequestIid')
  @Column({ type: 'int' })
  mergeRequestIid!: number;

  @Column({ type: 'varchar' })
  action!: MrActionType;

  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'varchar' })
  userName!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
