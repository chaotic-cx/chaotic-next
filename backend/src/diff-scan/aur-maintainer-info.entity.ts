import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('aur_maintainer_info')
@Index('IDX_aur_maintainer_info_username', ['username'], { unique: true })
export class AurMaintainerInfoEntity {
  @PrimaryColumn({ type: 'varchar' })
  username!: string;

  @Column({ type: 'timestamp' })
  registeredDate!: Date;

  @Column({ type: 'bigint' })
  fetchedAt!: number;
}
