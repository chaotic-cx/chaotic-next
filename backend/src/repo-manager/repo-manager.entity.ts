import type { PackageElfAnalysis as PackageElfAnalysisType, ParsedPackageMetadata } from '@chaotic-next/shared-lib';
import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  DeepPartial,
  Entity,
  In,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Repository,
  Unique,
} from 'typeorm';
import { Package } from '../builder/builder.entity';
import { BumpType, TriggerType } from '../interfaces/repo-manager';

@Entity()
@Index('IDX_archlinux_package_pkgname', ['pkgname'])
export class ArchlinuxPackage {
  @ApiProperty({ description: 'Package ID' })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({ description: 'Package name' })
  @Column({ type: 'varchar' })
  pkgname!: string;

  @ApiProperty({ description: 'Current package version' })
  @Column({ type: 'varchar', nullable: true })
  version!: string;

  @ApiProperty({ description: 'Package release number' })
  @Column({ type: 'int', nullable: true })
  pkgrel!: number;

  @ApiProperty({ description: 'Target architecture' })
  @Column({ type: 'varchar', nullable: true })
  arch!: string;

  @ApiProperty({ description: 'When the package was last updated (ISO 8601)' })
  @Column({ type: 'timestamp', nullable: true })
  lastUpdated!: Date;

  @ApiProperty({ description: 'Previous package version' })
  @Column({ type: 'varchar', nullable: true })
  previousVersion!: string | null;

  @ApiProperty({ description: 'Parsed package metadata', type: Object })
  @Column({ type: 'jsonb', nullable: true })
  metadata!: ParsedPackageMetadata;
}

@Entity()
@Index('IDX_package_bump_pkgId', ['pkg'])
@Index('IDX_package_bump_timestamp', ['timestamp'])
export class PackageBump {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'enum', enum: BumpType })
  bumpType!: BumpType;

  @ManyToOne(() => Package, (pkg) => pkg.id, { cascade: true })
  pkg!: Package;

  // Reference a pkg.id from the Package or ArchlinuxPackage entities, resolved
  // By the triggerFrom field
  @Column({ type: 'int' })
  trigger!: number;

  @Column({ type: 'enum', enum: TriggerType })
  triggerFrom!: TriggerType;

  @Column({ type: 'jsonb', nullable: true })
  details!: string[];

  @CreateDateColumn()
  timestamp!: Date;
}

/** Discriminator matching TriggerType: 0 = Arch, 1 = Chaotic. */
export type PackageElfPkgType = '0' | '1';

/**
 * ELF signal analysis of one package version, persisted by the signal scanner
 * so the bump logic can read what a package links/ships/owns.
 */
@Entity()
@Unique('PK_pkg_elf_analysis_uniq', ['pkgType', 'pkgId', 'version'])
export class PackageElfAnalysis {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'enum', enum: ['0', '1'] })
  pkgType!: PackageElfPkgType;

  /** pkg.id of a Package (CHAOTIC) or ArchlinuxPackage (ARCH) row. */
  @Column({ type: 'int' })
  pkgId!: number;

  @Column({ type: 'varchar' })
  version!: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  files!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  neededSonames!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  providedSonames!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  importedSymbols!: string[];

  @Column({ type: 'jsonb', default: () => "'{}'" })
  exportedSymbols!: Record<string, string[]>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  vtables!: Record<string, string[]>;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  directoriesOwned!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  directDirectories!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  pluginOf!: string[];

  /** Whether the package is broken in the current repo state (see brokenReasons). */
  @Column({ type: 'boolean', default: false })
  broken!: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  brokenReasons!: string[];

  @CreateDateColumn()
  scannedAt!: Date;

  toJSON(): PackageElfAnalysisType {
    return {
      version: this.version,
      files: this.files,
      neededSonames: this.neededSonames,
      providedSonames: this.providedSonames,
      importedSymbols: this.importedSymbols,
      exportedSymbols: this.exportedSymbols,
      vtables: this.vtables,
      directoriesOwned: this.directoriesOwned,
      directDirectories: this.directDirectories,
      pluginOf: this.pluginOf,
      broken: this.broken,
      brokenReasons: this.brokenReasons,
      scannedAt: this.scannedAt.toISOString(),
    };
  }
}

export async function bulkGetOrCreateArch(
  names: string[],
  connection: Repository<ArchlinuxPackage>,
): Promise<Map<string, ArchlinuxPackage>> {
  const byName = new Map<string, ArchlinuxPackage>();
  const unique = [...new Set(names)];
  if (unique.length === 0) return byName;

  for (const row of await connection.find({ where: { pkgname: In(unique) } })) {
    byName.set(row.pkgname, row);
  }
  const missing = unique.filter((n) => !byName.has(n));
  if (missing.length > 0) {
    const created = await connection.save(missing.map((name) => ({ pkgname: name }) as DeepPartial<ArchlinuxPackage>));
    for (const row of Array.isArray(created) ? created : [created]) byName.set(row.pkgname, row);
  }
  return byName;
}
