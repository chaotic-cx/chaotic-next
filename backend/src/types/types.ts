import { type BuildClass, type BuildResourceStats, BuildStatus } from '@chaotic-next/shared-lib';
import { type Repository } from 'typeorm';
import {
  type Build,
  type Builder,
  type Package,
  type Repo,
  type SilencedBuildFailure,
} from '../builder/builder.entity';

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
  resourceStats?: BuildResourceStats;
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

export interface DatabaseSuccessEvent {
  arch: string;
  pkgname: string;
  target_repo: string;
}

export interface BuilderDbConnections {
  build: Repository<Build>;
  builder: Repository<Builder>;
  package: Repository<Package>;
  repo: Repository<Repo>;
  silencedFailure: Repository<SilencedBuildFailure>;
}
