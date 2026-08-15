import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('notification_subscription')
export class NotificationSubscription {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', unique: true })
  endpoint!: string;

  @Column({ type: 'varchar' })
  p256dh!: string;

  @Column({ type: 'varchar' })
  auth!: string;

  @Column({ type: 'timestamp', nullable: true })
  expirationTime!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
