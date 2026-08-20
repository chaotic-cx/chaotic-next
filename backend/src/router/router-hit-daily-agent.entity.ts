import { Column, Entity, PrimaryColumn } from 'typeorm';

/** One row of the daily user-agent rollup, keyed by UTC day + package + user agent. Read-only for metrics. */
@Entity('router_hits_daily_agents')
export class RouterHitDailyAgent {
  @PrimaryColumn({ type: 'timestamp' })
  day!: Date;

  @PrimaryColumn({ type: 'text' })
  package!: string;

  @PrimaryColumn({ type: 'text', name: 'user_agent' })
  userAgent!: string;

  @Column({ type: 'bigint' })
  count!: string;
}
