import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DeepPartial, In, type Repository } from 'typeorm';
import { Builder, Package, Repo } from './builder.entity';
import { sleep } from '../utils/functions';

const CONFLICT_RETRIES = 3;
const RETRY_DELAY_MS = 50;

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '23505';
}

@Injectable()
export class EntityLookupService {
  constructor(
    @InjectRepository(Package)
    private readonly packageRepository: Repository<Package>,
    @InjectRepository(Builder)
    private readonly builderRepository: Repository<Builder>,
    @InjectRepository(Repo)
    private readonly repoRepository: Repository<Repo>,
    @InjectPinoLogger(EntityLookupService.name)
    private readonly pino: PinoLogger,
  ) {}

  async getOrCreatePackage(pkgname: string, repo: Repo): Promise<Package> {
    const existing = await this.findPackage(pkgname, repo);
    if (existing) return existing;
    try {
      return await this.packageRepository.save({
        pkgname: pkgname,
        repo: repo,
        lastUpdated: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        isActive: true,
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      this.pino.debug({ pkgname, repo: repo.name }, 'Concurrent insert detected; fetch the package row again');
      return this.retryFind(() => this.findPackage(pkgname, repo), { pkgname, repo: repo.name });
    }
  }

  async getOrCreateBuilder(name: string): Promise<Builder> {
    const existing = await this.builderRepository.findOne({ where: { name } });
    if (existing) return existing;
    try {
      return await this.builderRepository.save({
        name: name,
        isActive: false,
        description: `Added on ${new Date().toISOString()}`,
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      this.pino.debug({ builder: name }, 'Concurrent insert detected; fetch the builder row again');
      return this.retryFind(() => this.builderRepository.findOne({ where: { name } }), { builder: name });
    }
  }

  async getOrCreateRepo(name: string): Promise<Repo> {
    const existing = await this.repoRepository.findOne({ where: { name } });
    if (existing) return existing;
    try {
      return await this.repoRepository.save({ name });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      this.pino.debug({ repo: name }, 'Concurrent insert detected; fetch the repo row again');
      return this.retryFind(() => this.repoRepository.findOne({ where: { name } }), { repo: name });
    }
  }

  async bulkGetOrCreatePackages(entries: { pkgname: string; repo: Repo }[]): Promise<Map<string, Package>> {
    const byKey = new Map<string, Package>();
    if (entries.length === 0) return byKey;

    const names = [...new Set(entries.map((e) => e.pkgname))];
    const existing = await this.packageRepository.find({ where: { pkgname: In(names) }, relations: { repo: true } });
    for (const pkg of existing) {
      if (pkg.repo) byKey.set(`${pkg.repo.name}:${pkg.pkgname}`, pkg);
    }

    const toCreate: { pkgname: string; repo: Repo }[] = [];
    const seen = new Set<string>();
    for (const e of entries) {
      const key = `${e.repo.name}:${e.pkgname}`;
      if (byKey.has(key) || seen.has(key)) continue;
      seen.add(key);
      toCreate.push(e);
    }
    if (toCreate.length === 0) return byKey;

    try {
      const created = await this.packageRepository.save(
        toCreate.map(
          (e) =>
            ({
              pkgname: e.pkgname,
              repo: e.repo,
              lastUpdated: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              isActive: true,
            }) as DeepPartial<Package>,
        ),
      );
      for (const row of Array.isArray(created) ? created : [created]) {
        if (row.repo) byKey.set(`${row.repo.name}:${row.pkgname}`, row);
      }
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      this.pino.debug({ count: toCreate.length }, 'Concurrent insert detected in bulk batch; fetch packages again');
      return this.bulkGetOrCreatePackages(entries);
    }
    return byKey;
  }

  private async findPackage(pkgname: string, repo: Repo): Promise<Package | undefined> {
    const packages = await this.packageRepository.find({ where: { pkgname }, relations: { repo: true } });
    return packages.find((pkg) => pkg.repo?.name === repo.name);
  }

  private async retryFind<T>(find: () => Promise<T | null | undefined>, context: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < CONFLICT_RETRIES; attempt += 1) {
      await sleep(RETRY_DELAY_MS);
      const row = await find();
      if (row) return row;
    }
    throw new Error(`Concurrent insert not found after ${CONFLICT_RETRIES} retries: ${JSON.stringify(context)}`);
  }
}
