import { registerAs } from '@nestjs/config';
import * as path from 'node:path';

export const DEFAULT_BUILDER_IMAGE = 'registry.gitlab.com/garuda-linux/tools/chaotic-manager/builder:latest';

const DEFAULT_EXTRA_PACMAN_REPOS = '[chaotic-aur]\nServer = https://secret-mirror.chaotic.cx/$repo/$arch';
const DEFAULT_EXTRA_PACMAN_KEYRINGS = 'https://cdn-mirror.chaotic.cx/chaotic-aur/chaotic-keyring.pkg.tar.zst';

const DEFAULT_CPU_LIMIT = 4;
const DEFAULT_RAM_LIMIT_MIB = 8192;
const DEFAULT_PIDS_LIMIT = 1024;
const DEFAULT_IDLE_TIMEOUT_SECONDS = 600;
const DEFAULT_POLL_INTERVAL_MS = 15_000;
const DEFAULT_BUILDER_TIMEOUT_SECONDS = 3600;

export interface PortableBuilderConfig {
  dockerSocket: string;
  image: string;
  workDir: string;
  publicBaseUrl: string;
  cpuLimit: number;
  memoryLimitMiB: number;
  pidsLimit: number;
  idleTimeoutSeconds: number;
  pollIntervalMs: number;
  builderTimeoutSeconds: number;
  extraPacmanRepos: string;
  extraPacmanKeyrings: string;
  clamavImage: string;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export default registerAs('portable-builder', (): PortableBuilderConfig => ({
  dockerSocket: process.env.CAUR_BUILDER_DOCKER_SOCKET ?? '/var/run/docker.sock',
  image: process.env.CAUR_BUILDER_IMAGE ?? DEFAULT_BUILDER_IMAGE,
  workDir: process.env.CAUR_BUILDER_WORKDIR ?? path.join(process.cwd(), 'data', 'portable-builder'),
  publicBaseUrl:
    process.env.CAUR_BUILDER_PUBLIC_URL ?? process.env.BUILD_SERVER_URL ?? 'https://builds.garudalinux.org/api',
  cpuLimit: numberEnv('CAUR_BUILDER_CPU_LIMIT', DEFAULT_CPU_LIMIT),
  memoryLimitMiB: numberEnv('CAUR_BUILDER_RAM_LIMIT', DEFAULT_RAM_LIMIT_MIB),
  pidsLimit: numberEnv('CAUR_BUILDER_PIDS_LIMIT', DEFAULT_PIDS_LIMIT),
  idleTimeoutSeconds: numberEnv('CAUR_BUILDER_IDLE_TIMEOUT', DEFAULT_IDLE_TIMEOUT_SECONDS),
  pollIntervalMs: numberEnv('CAUR_BUILDER_POLL_INTERVAL', DEFAULT_POLL_INTERVAL_MS),
  builderTimeoutSeconds: numberEnv('CAUR_BUILDER_TIMEOUT', DEFAULT_BUILDER_TIMEOUT_SECONDS),
  extraPacmanRepos: process.env.CAUR_BUILDER_EXTRA_PACMAN_REPOS ?? DEFAULT_EXTRA_PACMAN_REPOS,
  extraPacmanKeyrings: process.env.CAUR_BUILDER_EXTRA_PACMAN_KEYRINGS ?? DEFAULT_EXTRA_PACMAN_KEYRINGS,
  // Signature DB lives in a docker volume, so only the first scan pays the download.
  clamavImage: process.env.CAUR_BUILDER_CLAMAV_IMAGE ?? '',
}));
