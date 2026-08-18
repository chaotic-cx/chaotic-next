import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** One row of the router's hit log; read-only for metrics aggregation. */
@Entity('router-hits')
@Index('router_hits_timestamp_idx', ['timestamp'])
export class RouterHit {
  @PrimaryColumn({ type: 'text', name: 'package' })
  package!: string;

  @PrimaryColumn({ type: 'text', name: 'version' })
  version!: string;

  @PrimaryColumn({ type: 'text', name: 'repo' })
  repo!: string;

  @PrimaryColumn({ type: 'text', name: 'arch' })
  arch!: string;

  @PrimaryColumn({ type: 'text', name: 'hostname' })
  hostname!: string;

  @PrimaryColumn({ type: 'inet', name: 'ip' })
  ip!: string;

  @PrimaryColumn({ type: 'char', length: 2, name: 'country' })
  country!: string;

  @Column({ type: 'text', name: 'user-agent', nullable: true })
  userAgent!: string;

  @Column({ type: 'timestamp', name: 'timestamp' })
  timestamp!: Date;
}
