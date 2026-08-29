import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { type NotificationType } from '@chaotic-next/shared-lib';

@Entity('notification_preference')
@Index(['userId', 'type'], { unique: true })
export class NotificationPreference {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'varchar' })
  type!: NotificationType;

  @Column({ type: 'boolean' })
  enabled!: boolean;
}
