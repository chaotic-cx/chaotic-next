import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Dockerode, { type Container, type HostConfig } from 'dockerode';
import type { Readable } from 'node:stream';
import { usageFromStats, type ContainerUsage } from './container-usage';

export interface CreateBuildContainerOptions {
  image: string;
  cmd: string[];
  binds: string[];
  env: string[];
  labels: Record<string, string>;
  hostConfig?: HostConfig;
  entrypoint?: string[];
}

/** The wait API answers with the exit code but no longer returns a typed body for condition "removed". */
interface RemovedWaitResult {
  StatusCode?: number;
}

/** Thin dockerode wrapper around the Docker socket, mirroring chaotic-manager's container handling. */
@Injectable()
export class DockerService {
  private readonly docker: Dockerode;
  private readonly pullsInFlight = new Map<string, Promise<void>>();

  constructor(
    configService: ConfigService,
    @InjectPinoLogger(DockerService.name) private readonly pino: PinoLogger,
  ) {
    this.docker = new Dockerode({ socketPath: configService.getOrThrow<string>('portable-builder.dockerSocket') });
  }

  async ensureImage(name: string): Promise<void> {
    const inFlight = this.pullsInFlight.get(name);
    if (inFlight) return inFlight;
    const pull = this.pullImage(name).finally(() => this.pullsInFlight.delete(name));
    this.pullsInFlight.set(name, pull);
    return pull;
  }

  private async pullImage(name: string): Promise<void> {
    try {
      await this.docker.getImage(name).inspect();
      return;
    } catch {
      this.pino.info({ image: name }, 'Pulling container image');
    }
    await new Promise<void>((resolve, reject) => {
      this.docker.pull(name, (err: unknown, stream: NodeJS.ReadableStream | undefined) => {
        if (err || !stream) {
          reject(err instanceof Error ? err : new Error(`Failed to pull image ${name}`));
          return;
        }
        this.docker.modem.followProgress(stream, (progressError: unknown) => {
          if (progressError) reject(progressError instanceof Error ? progressError : new Error(String(progressError)));
          else resolve();
        });
      });
    });
  }

  /**
   * Creates a build container with the same base hardening chaotic-manager applies: auto removal,
   * nofile ulimits, and SYS_ADMIN for builds that need extra mounts during their build process.
   */
  async createBuildContainer(options: CreateBuildContainerOptions): Promise<Container> {
    await this.ensureImage(options.image);
    return this.docker.createContainer({
      Image: options.image,
      Entrypoint: options.entrypoint,
      Cmd: options.cmd,
      Env: options.env,
      Labels: options.labels,
      AttachStderr: true,
      AttachStdout: true,
      OpenStdin: false,
      Tty: true,
      StdinOnce: false,
      AttachStdin: false,
      HostConfig: {
        AutoRemove: true,
        Binds: options.binds,
        Ulimits: [{ Name: 'nofile', Soft: 1024, Hard: 1048576 }],
        CapAdd: ['SYS_ADMIN'],
        ...options.hostConfig,
      },
    });
  }

  /** Starts the container, streams its (TTY, unmultiplexed) output to onOutput, and awaits exit. */
  async startAndWait(container: Container, onOutput: (chunk: string) => void): Promise<number> {
    const stream = (await container.attach({ stream: true, stdout: true, stderr: true })) as unknown as Readable;
    stream.setEncoding('utf8');
    stream.on('data', onOutput);
    await container.start();
    const result = (await container.wait({ condition: 'removed' })) as RemovedWaitResult;
    return result.StatusCode ?? 0;
  }

  /** Samples one-shot stats; returns null on failure so the watchdog ignores the probe. */
  async getUsage(container: Container): Promise<ContainerUsage | null> {
    try {
      const stats = await container.stats({ 'stream': false, 'one-shot': true });
      return usageFromStats(stats);
    } catch (err) {
      this.pino.warn({ err }, 'Failed to sample container usage');
      return null;
    }
  }

  /** Force-removes a container; with AutoRemove this also resolves a pending wait call. */
  async kill(container: Container): Promise<void> {
    await this.docker.getContainer(container.id).remove({ force: true });
  }

  /**
   * Build output is owned by the in-container builder user; make it world-readable on the host so
   * the backend and scanners can access it.
   */
  async chmodRecursive(hostDir: string, image: string, labels: Record<string, string>): Promise<void> {
    await this.runOneShot(['chmod', '-R', 'a+rX', '/target'], hostDir, image, labels);
  }

  /**
   * Removes a host directory whose contents are root-owned (created by containers). The container
   * empties the bind; the (empty) mount point itself is removed by the caller on the host.
   */
  async removeTree(hostDir: string, image: string, labels: Record<string, string>): Promise<void> {
    await this.runOneShot(['rm', '-rf', '/target'], hostDir, image, labels);
  }

  private async runOneShot(
    cmd: string[],
    bindDir: string,
    image: string,
    labels: Record<string, string>,
  ): Promise<void> {
    const container = await this.createBuildContainer({
      image,
      cmd,
      binds: [`${bindDir}:/target`],
      env: [],
      labels,
      entrypoint: [],
    });
    const exitCode = await this.startAndWait(container, () => undefined);
    if (exitCode !== 0) throw new Error(`Helper command '${cmd.join(' ')}' exited with code ${exitCode}`);
  }

  async sweepLabeled(labelFilter: string): Promise<number> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: JSON.stringify({ label: [labelFilter] }),
    });
    for (const info of containers) {
      await this.docker
        .getContainer(info.Id)
        .remove({ force: true })
        .catch((err: unknown) => {
          this.pino.warn({ err }, 'Failed to remove leftover container');
        });
    }
    return containers.length;
  }

  /** Creates the volume when missing; existing volumes are reused. */
  async ensureVolume(name: string): Promise<void> {
    await this.docker.createVolume({ Name: name }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('already exists')) throw err;
    });
  }

  async removeVolume(name: string): Promise<void> {
    await this.docker
      .getVolume(name)
      .remove({ force: true })
      .catch((err: unknown) => {
        this.pino.warn({ err, name }, 'Failed to remove volume');
      });
  }
}
