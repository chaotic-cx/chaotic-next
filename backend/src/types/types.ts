import { type BuildClass, BuildStatus } from '@chaotic-next/shared-lib';
import type { Repository } from 'typeorm';
import type { Build, Builder, Package, Repo } from '../builder/builder.entity';

export { BuildStatus };

export interface MoleculerBuildObject {
  arch: string;
  build_class: BuildClass;
  builder_name: string;
  commit?: string;
  duration?: number;
  logUrl?: string;
  pkgname: string;
  replaced: boolean;
  status?: BuildStatus;
  target_repo: string;
  timestamp: number;
}

export interface QueuePromotedEvent {
  arch: string;
  pkgbase: string;
  target_repo: string;
  timestamp: number;
}

export interface BuilderDbConnections {
  build: Repository<Build>;
  builder: Repository<Builder>;
  package: Repository<Package>;
  repo: Repository<Repo>;
}
