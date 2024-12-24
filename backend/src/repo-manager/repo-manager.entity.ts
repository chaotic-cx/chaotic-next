import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, Repository } from 'typeorm';
import { Mutex } from 'async-mutex';
import { Logger } from '@nestjs/common';
import { BumpType, ParsedPackageMetadata, TriggerType } from '../interfaces/repo-manager';
import { Package } from '../builder/builder.entity';

@Entity()
export class ArchlinuxPackage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  pkgname: string;

  @Column({ type: 'varchar', nullable: true })
  version: string;

  @Column({ type: 'int', nullable: true })
  pkgrel: number;

  @Column({ type: 'varchar', nullable: true })
  arch: string;

  @Column({ type: 'timestamp', nullable: true })
  lastUpdated: Date;

  @Column({ type: 'varchar', nullable: true })
  previousVersion: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: ParsedPackageMetadata;
}

@Entity()
export class RepoManagerSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  key: string;

  @Column({ type: 'varchar' })
  value: string;
}

@Entity()
export class PackageBump {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: BumpType })
  bumpType: BumpType;

  @ManyToOne(() => Package, (pkg) => pkg.id, { cascade: true })
  pkg: Package;

  // Reference a pkg.id from the Package or ArchlinuxPackage entities, resolved
  // By the triggerFrom field
  @Column({ type: 'int' })
  trigger: number;

  @Column({ type: 'enum', enum: TriggerType })
  triggerFrom: TriggerType;

  @CreateDateColumn()
  timestamp: Date;
}

const packageMutex = new Mutex();
const settingsMutex = new Mutex();

/**
 * Check if a package exists in the database, if not create a new entry
 * @param pkg The package object
 * @param connection The repository connection
 * @returns The package object itself
 */
export async function archPkgExists(
  pkg: {
    version: string;
    name: string;
  },
  connection: Repository<ArchlinuxPackage>,
): Promise<ArchlinuxPackage> {
  return packageMutex.runExclusive(async () => {
    try {
      const packages: ArchlinuxPackage[] = await connection.find({ where: { pkgname: pkg.name } });
      let packageExists: Partial<ArchlinuxPackage> = packages.find((onePkg) => {
        return onePkg.pkgname === pkg.name;
      });

      if (packageExists === undefined) {
        Logger.log(`Package ${pkg.name} not found in database, creating new entry`, 'RepoManagerEntity');
        packageExists = await connection.save({
          pkgname: pkg.name,
          version: pkg.version,
        });
      }

      return packageExists as ArchlinuxPackage;
    } catch (err: unknown) {
      Logger.error(err, 'RepoManagerEntity');
    }
  });
}

/**
 * Check if a setting exists in the database, if not create a new entry
 * @param key The key to check
 * @param connection The repository connection
 */
export function repoSettingsExists(
  key: string,
  connection: Repository<RepoManagerSettings>,
): Promise<RepoManagerSettings> {
  return settingsMutex.runExclusive(async () => {
    try {
      const settings: RepoManagerSettings[] = await connection.find({ where: { key } });
      let settingExists: Partial<RepoManagerSettings> = settings.find((oneSetting) => {
        return oneSetting.key === key;
      });

      if (settingExists === undefined) {
        Logger.log(`Setting ${key} not found in database, creating new entry`, 'RepoManagerEntity');
        settingExists = await connection.save({
          key,
          value: '',
        });
      }

      return settingExists as RepoManagerSettings;
    } catch (err: unknown) {
      Logger.error(err, 'RepoManagerEntity');
    }
  });
}
