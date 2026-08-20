import { Column, Entity, PrimaryColumn } from 'typeorm';

/** One row of the daily router-hit rollup, keyed by UTC day + dimension. Read-only for metrics. */
@Entity('router_hits_daily')
export class RouterHitDaily {
  @PrimaryColumn({ type: 'timestamp' })
  day!: Date;

  @PrimaryColumn({ type: 'char', length: 2 })
  country!: string;

  @PrimaryColumn({ type: 'text' })
  hostname!: string;

  @PrimaryColumn({ type: 'text' })
  package!: string;

  @Column({ type: 'bigint' })
  count!: string;
}
