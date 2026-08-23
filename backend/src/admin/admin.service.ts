import {
  AdminPackageElfAnalysis,
  type BuildClassSuggestion,
  MrAction,
  Package as PackageDto,
  PackageBump,
  PackageKey,
  packageKey,
  Paginated,
  PipelineTriggerAction,
  PKG_TYPE_ARCH,
  PKG_TYPE_CHAOTIC,
  PkgType,
} from '@chaotic-next/shared-lib';
import { HttpService } from '@nestjs/axios';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ILike, In, Repository } from 'typeorm';
import { BuildClassSuggesterService } from '../builder/build-class-suggester.service';
import { Builder, Package, Repo } from '../builder/builder.entity';
import { MrAction as MrActionEntity } from '../gitlab/mr-action.entity';
import { PipelineTrigger as PipelineTriggerEntity } from '../gitlab/pipeline-trigger.entity';
import { TriggerType } from '../interfaces/repo-manager';
import {
  ArchlinuxPackage,
  PackageBump as PackageBumpEntity,
  PackageElfAnalysis,
} from '../repo-manager/repo-manager.entity';
import { SignalScanService } from '../repo-manager/scan';
import { encryptAes, errorMessage } from '../utils/functions';
import { paginate, resolvePagination } from '../utils/pagination';

export interface CreatePackageBody {
  pkgname: string;
  isActive?: boolean;
  skipSignalScan?: boolean;
  version?: string;
  pkgrel?: number;
  bump?: number;
  repoId?: number;
}

export interface CreateArchPackageBody {
  pkgname: string;
  version?: string;
  pkgrel?: number;
  arch?: string;
}

export interface CreateRepoBody {
  name: string;
  repoUrl?: string;
  isActive?: boolean;
  gitRef?: string;
  dbPath?: string;
  status?: number;
  gitlabProjectId?: string;
  apiToken?: string;
}

export interface CreateBuilderBody {
  name: string;
  description?: string;
  builderClass?: string;
  isActive?: boolean;
}

export interface CreateElfAnalysisBody {
  pkgType: PkgType;
  pkgId: number;
  version: string;
  broken?: boolean;
  brokenReasons?: string[];
}

const FK_VIOLATION_CODE = '23503';
const RESTRICT_VIOLATION_CODE = '23001';
const INTEGRITY_VIOLATION_CODES = new Set([FK_VIOLATION_CODE, RESTRICT_VIOLATION_CODE]);

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(Package) private readonly packageRepository: Repository<Package>,
    @InjectRepository(ArchlinuxPackage) private readonly archPackageRepository: Repository<ArchlinuxPackage>,
    @InjectRepository(Repo) private readonly repoRepository: Repository<Repo>,
    @InjectRepository(Builder) private readonly builderRepository: Repository<Builder>,
    @InjectRepository(MrActionEntity) private readonly mrActionRepository: Repository<MrActionEntity>,
    @InjectRepository(PipelineTriggerEntity)
    private readonly pipelineTriggerRepository: Repository<PipelineTriggerEntity>,
    @InjectRepository(PackageBumpEntity) private readonly packageBumpRepository: Repository<PackageBumpEntity>,
    @InjectRepository(PackageElfAnalysis) private readonly elfAnalysisRepository: Repository<PackageElfAnalysis>,
    private readonly configService: ConfigService,
    private readonly signalScanService: SignalScanService,
    private readonly httpService: HttpService,
    private readonly buildClassSuggester: BuildClassSuggesterService,
  ) {}

  async listPackages(
    page?: number,
    perPage?: number,
    q?: string,
    repoId?: number,
    active?: boolean,
  ): Promise<Paginated<PackageDto>> {
    const { page: safePage, perPage: safePerPage, skip } = resolvePagination(page, perPage);

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (q) {
      conditions.push('package.pkgname ILIKE :q');
      params.q = `%${q}%`;
    }
    if (repoId !== undefined) {
      conditions.push('package.repoId = :repoId');
      params.repoId = repoId;
    }
    if (active !== undefined) {
      conditions.push('package.isActive = :active');
      params.active = active;
    }

    const query = this.packageRepository
      .createQueryBuilder('package')
      .leftJoinAndSelect('package.repo', 'repo')
      .where(conditions.length ? conditions.join(' AND ') : '1=1', params)
      .orderBy('package.pkgname', 'ASC')
      .skip(skip)
      .take(safePerPage);

    const [rows, total] = await query.getManyAndCount();

    const suggestions = await this.resolveBuildClassSuggestions(rows.map((pkg) => pkg.pkgname));
    const items = rows.map((pkg) => ({
      id: pkg.id,
      pkgname: pkg.pkgname,
      lastUpdated: pkg.lastUpdated,
      createdAt: pkg.createdAt,
      isActive: pkg.isActive,
      skipSignalScan: pkg.skipSignalScan,
      version: pkg.version,
      bumpCount: pkg.bumpCount,
      pkgrel: pkg.pkgrel,
      bump: pkg.bump,
      repo: pkg.repo?.id,
      reponame: pkg.repo?.name,
      buildClassSuggestion: suggestions.get(pkg.pkgname) ?? null,
    }));
    return paginate(items, total, safePage, safePerPage);
  }

  private async resolveBuildClassSuggestions(pkgnames: string[]) {
    try {
      const suggestions = await this.buildClassSuggester.suggestForPackages(pkgnames);
      return new Map(suggestions.map((suggestion) => [suggestion.pkgname, suggestion]));
    } catch (err) {
      this.logger.warn(`Build class suggestions failed, rendering without them: ${errorMessage(err)}`);
      return new Map<string, BuildClassSuggestion>();
    }
  }

  async updatePackage(id: number, body: Partial<CreatePackageBody>): Promise<Package> {
    const pkg = await this.packageRepository.findOne({ where: { id }, relations: { repo: true } });
    if (!pkg) throw new NotFoundException(`Package ${id} not found`);

    if (body.pkgname !== undefined) pkg.pkgname = body.pkgname;
    if (body.isActive !== undefined) pkg.isActive = body.isActive;
    if (body.skipSignalScan !== undefined) pkg.skipSignalScan = body.skipSignalScan;
    if (body.version !== undefined) pkg.version = body.version;
    if (body.pkgrel !== undefined) pkg.pkgrel = body.pkgrel;
    if (body.bump !== undefined) pkg.bump = body.bump;
    if (body.repoId !== undefined) {
      pkg.repo = body.repoId ? await this.findRepo(body.repoId) : (null as unknown as Repo);
    }

    return this.packageRepository.save(pkg);
  }

  async deletePackage(id: number): Promise<void> {
    await this.deleteEntity(() => this.packageRepository.delete(id), `Package ${id}`);
  }

  async listArchPackages(page?: number, perPage?: number, q?: string): Promise<Paginated<ArchlinuxPackage>> {
    const { page: safePage, perPage: safePerPage, skip } = resolvePagination(page, perPage);

    const where = q ? { pkgname: ILike(`%${q}%`) } : {};
    const [items, total] = await this.archPackageRepository.findAndCount({
      where,
      order: { pkgname: 'ASC' },
      skip,
      take: safePerPage,
    });
    return paginate(items, total, safePage, safePerPage);
  }

  async updateArchPackage(id: number, body: Partial<CreateArchPackageBody>): Promise<ArchlinuxPackage> {
    const pkg = await this.archPackageRepository.findOne({ where: { id } });
    if (!pkg) throw new NotFoundException(`Arch package ${id} not found`);

    if (body.pkgname !== undefined) pkg.pkgname = body.pkgname;
    if (body.version !== undefined) pkg.version = body.version;
    if (body.pkgrel !== undefined) pkg.pkgrel = body.pkgrel;
    if (body.arch !== undefined) pkg.arch = body.arch;

    return this.archPackageRepository.save(pkg);
  }

  async deleteArchPackage(id: number): Promise<void> {
    await this.deleteEntity(() => this.archPackageRepository.delete(id), `Arch package ${id}`);
  }

  async listRepos(): Promise<Repo[]> {
    return this.repoRepository.find({
      select: {
        id: true,
        name: true,
        repoUrl: true,
        isActive: true,
        status: true,
        gitRef: true,
        dbPath: true,
        gitlabProjectId: true,
      },
      order: { name: 'ASC' },
    });
  }

  async createRepo(body: CreateRepoBody): Promise<Repo> {
    return this.repoRepository.save({
      name: body.name,
      repoUrl: body.repoUrl,
      isActive: body.isActive ?? true,
      gitRef: body.gitRef ?? 'main',
      dbPath: body.dbPath,
      status: body.status,
      gitlabProjectId: body.gitlabProjectId,
      apiToken: body.apiToken ? this.encryptRepoToken(body.apiToken) : undefined,
    });
  }

  async updateRepo(id: number, body: Partial<CreateRepoBody>): Promise<Repo> {
    const repo = await this.repoRepository.findOne({ where: { id } });
    if (!repo) throw new NotFoundException(`Repo ${id} not found`);

    if (body.name !== undefined) repo.name = body.name;
    if (body.repoUrl !== undefined) repo.repoUrl = body.repoUrl;
    if (body.isActive !== undefined) repo.isActive = body.isActive;
    if (body.gitRef !== undefined) repo.gitRef = body.gitRef;
    if (body.dbPath !== undefined) repo.dbPath = body.dbPath;
    if (body.status !== undefined) repo.status = body.status;
    if (body.gitlabProjectId !== undefined) repo.gitlabProjectId = body.gitlabProjectId;
    if (body.apiToken !== undefined && body.apiToken !== '') repo.apiToken = this.encryptRepoToken(body.apiToken);

    return this.repoRepository.save(repo);
  }

  async deleteRepo(id: number): Promise<void> {
    await this.deleteEntity(() => this.repoRepository.delete(id), `Repo ${id}`);
  }

  async listBuilders(page?: number, perPage?: number, q?: string, active?: boolean): Promise<Paginated<Builder>> {
    const { page: safePage, perPage: safePerPage, skip } = resolvePagination(page, perPage);
    const where: Record<string, unknown> = {};
    if (q) where.name = ILike(`%${q}%`);
    if (active !== undefined) where.isActive = active;
    const [items, total] = await this.builderRepository.findAndCount({
      where,
      order: { name: 'ASC' },
      skip,
      take: safePerPage,
    });
    return paginate(items, total, safePage, safePerPage);
  }

  async createBuilder(body: CreateBuilderBody): Promise<Builder> {
    return this.builderRepository.save({
      name: body.name,
      description: body.description,
      builderClass: body.builderClass,
      isActive: body.isActive ?? true,
    });
  }

  async updateBuilder(id: number, body: Partial<CreateBuilderBody>): Promise<Builder> {
    const builder = await this.builderRepository.findOne({ where: { id } });
    if (!builder) throw new NotFoundException(`Builder ${id} not found`);

    if (body.name !== undefined) builder.name = body.name;
    if (body.description !== undefined) builder.description = body.description;
    if (body.builderClass !== undefined) builder.builderClass = body.builderClass;
    if (body.isActive !== undefined) builder.isActive = body.isActive;

    return this.builderRepository.save(builder);
  }

  async deleteBuilder(id: number): Promise<void> {
    await this.deleteEntity(() => this.builderRepository.delete(id), `Builder ${id}`);
  }

  async listMrActions(page?: number, perPage?: number, q?: string, action?: string): Promise<Paginated<MrAction>> {
    const { page: safePage, perPage: safePerPage, skip } = resolvePagination(page, perPage);
    let conditions: Record<string, unknown>[] = [];
    if (q) {
      const isNumeric = /^\d+$/.test(q);
      conditions = [
        ...(isNumeric ? [{ mergeRequestIid: Number(q) }] : []),
        { commitSha: ILike(`%${q}%`) },
        { userId: ILike(`%${q}%`) },
        { userName: ILike(`%${q}%`) },
      ];
    }
    if (action !== undefined) {
      // AND the action filter with every OR-branch above (or start fresh if no q).
      conditions = (conditions.length ? conditions : [{}]).map((condition) => ({ ...condition, action }));
    }
    const [rows, total] = await this.mrActionRepository.findAndCount({
      where: conditions.length ? conditions : {},
      order: { createdAt: 'DESC' },
      skip,
      take: safePerPage,
    });
    const items: MrAction[] = rows.map((row) => ({
      id: row.id,
      mergeRequestIid: row.mergeRequestIid,
      commitSha: row.commitSha,
      action: row.action,
      userId: row.userId,
      userName: row.userName,
      createdAt: row.createdAt.toISOString(),
    }));
    return paginate(items, total, safePage, safePerPage);
  }

  async listPipelineTriggers(
    page?: number,
    perPage?: number,
    q?: string,
    operation?: string,
  ): Promise<Paginated<PipelineTriggerAction>> {
    const { page: safePage, perPage: safePerPage, skip } = resolvePagination(page, perPage);
    let conditions: Record<string, unknown>[] = [];
    if (q) {
      const isNumeric = /^\d+$/.test(q);
      conditions = [
        ...(isNumeric ? [{ pipelineId: Number(q) }] : []),
        { commitSha: ILike(`%${q}%`) },
        { userId: ILike(`%${q}%`) },
        { userName: ILike(`%${q}%`) },
      ];
    }
    if (operation !== undefined) {
      // AND the operation filter with every OR-branch above (or start fresh if no q).
      conditions = (conditions.length ? conditions : [{}]).map((condition) => ({ ...condition, operation }));
    }
    const [rows, total] = await this.pipelineTriggerRepository.findAndCount({
      where: conditions.length ? conditions : {},
      order: { createdAt: 'DESC' },
      skip,
      take: safePerPage,
    });
    const items: PipelineTriggerAction[] = rows.map((row) => ({
      id: row.id,
      ref: row.ref,
      commitSha: row.commitSha,
      operation: row.operation,
      inputs: row.inputs,
      pipelineId: row.pipelineId ?? undefined,
      webUrl: row.webUrl ?? undefined,
      userId: row.userId,
      userName: row.userName,
      createdAt: row.createdAt.toISOString(),
    }));
    return paginate(items, total, safePage, safePerPage);
  }

  async listPackageBumps(
    page?: number,
    perPage?: number,
    q?: string,
    bumpType?: number,
    triggerFrom?: number,
  ): Promise<Paginated<PackageBump>> {
    const { page: safePage, perPage: safePerPage, skip } = resolvePagination(page, perPage);

    const query = this.packageBumpRepository
      .createQueryBuilder('bump')
      .leftJoinAndSelect('bump.pkg', 'pkg')
      .skip(skip)
      .take(safePerPage)
      .orderBy('bump.timestamp', 'DESC');
    if (q) {
      query.where('pkg.pkgname ILIKE :q', { q: `%${q}%` });
    }
    if (bumpType !== undefined) {
      query.andWhere('bump.bumpType = :bumpType', { bumpType });
    }
    if (triggerFrom !== undefined) {
      query.andWhere('bump.triggerFrom = :triggerFrom', { triggerFrom });
    }

    const [rows, total] = await query.getManyAndCount();

    const triggerNames = await this.resolveTriggerNames(rows);

    const items = rows.map((row) => this.toPackageBumpDto(row, triggerNames));
    return paginate(items, total, safePage, safePerPage);
  }

  /**
   * List rebuild-trigger bumps related to one ELF analysis row, in both
   * directions: bumps where the analysed package is the trigger (it caused a
   * dependent to rebuild) and bumps where it is the rebuilt package.
   */
  async listElfAnalysisBumps(id: number): Promise<PackageBump[]> {
    const analysis = await this.elfAnalysisRepository.findOne({ where: { id } });
    if (!analysis) throw new NotFoundException(`ELF analysis ${id} not found`);

    const triggerType = Number(analysis.pkgType);
    const query = this.packageBumpRepository
      .createQueryBuilder('bump')
      .leftJoinAndSelect('bump.pkg', 'pkg')
      .where('bump.trigger = :pkgId AND bump.triggerFrom = :triggerType', {
        pkgId: analysis.pkgId,
        triggerType,
      });
    // "bump.pkgId" is always a Chaotic package, so only Chaotic analyses can be
    // the rebuilt package; an Arch row's pkgId lives in a separate id sequence
    // that can collide with Chaotic ids.
    if (analysis.pkgType === PKG_TYPE_CHAOTIC) {
      query.orWhere('bump.pkgId = :pkgId', { pkgId: analysis.pkgId });
    }
    const rows = await query.orderBy('bump.timestamp', 'DESC').getMany();

    const triggerNames = await this.resolveTriggerNames(rows);
    return rows.map((row) => this.toPackageBumpDto(row, triggerNames));
  }

  async listElfAnalysis(
    page?: number,
    perPage?: number,
    q?: string,
    pkgType?: '0' | '1',
    broken?: boolean,
  ): Promise<Paginated<AdminPackageElfAnalysis>> {
    const { page: safePage, perPage: safePerPage, skip } = resolvePagination(page, perPage);

    const query = this.elfAnalysisRepository.createQueryBuilder('analysis');
    if (q) {
      const resolvedIds = await this.resolveElfPackageIdsByName(q);
      const conditions = [`analysis.version ILIKE :q`];
      const params: Record<string, unknown> = { q: `%${q}%` };
      if (resolvedIds.arch.length > 0) {
        conditions.push(`(analysis.pkgType = '${PKG_TYPE_ARCH}' AND analysis.pkgId IN (:...archIds))`);
        params.archIds = resolvedIds.arch;
      }
      if (resolvedIds.chaotic.length > 0) {
        conditions.push(`(analysis.pkgType = '${PKG_TYPE_CHAOTIC}' AND analysis.pkgId IN (:...chaoticIds))`);
        params.chaoticIds = resolvedIds.chaotic;
      }
      const numericId = /^\d+$/.test(q) ? Number(q) : undefined;
      if (numericId !== undefined) {
        conditions.push(`analysis.pkgId = :numericId`);
        params.numericId = numericId;
      }
      query.where(`(${conditions.join(' OR ')})`, params);
    }
    if (pkgType !== undefined) {
      query.andWhere('analysis.pkgType = :pkgType', { pkgType });
    }
    if (broken !== undefined) {
      query.andWhere('analysis.broken = :broken', { broken });
    }

    query.skip(skip).take(safePerPage).orderBy('analysis.scannedAt', 'DESC');

    const [rows, total] = await query.getManyAndCount();

    const names = await this.resolveElfPackageNames(rows);

    const items: AdminPackageElfAnalysis[] = rows.map((row) => ({
      id: row.id,
      pkgType: row.pkgType,
      pkgId: row.pkgId,
      pkgname: names.get(packageKey(row.pkgType, row.pkgId)),
      version: row.version,
      broken: row.broken,
      brokenReasons: row.brokenReasons ?? [],
      hasCompiledCode: row.hasCompiledCode,
      isSourceCompiled: row.isSourceCompiled,
      scannedAt: row.scannedAt.toISOString(),
    }));
    return paginate(items, total, safePage, safePerPage);
  }

  async updateElfAnalysis(id: number, body: Partial<CreateElfAnalysisBody>): Promise<AdminPackageElfAnalysis> {
    const row = await this.elfAnalysisRepository.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Package ELF analysis ${id} not found`);

    if (body.pkgType !== undefined) row.pkgType = body.pkgType;
    if (body.pkgId !== undefined) row.pkgId = body.pkgId;
    if (body.version !== undefined) row.version = body.version;
    if (body.broken !== undefined) row.broken = body.broken;
    if (body.brokenReasons !== undefined) row.brokenReasons = body.brokenReasons;

    return this.toElfAnalysisView(await this.elfAnalysisRepository.save(row));
  }

  async deleteElfAnalysis(id: number): Promise<void> {
    await this.deleteEntity(() => this.elfAnalysisRepository.delete(id), `Package ELF analysis ${id}`);
  }

  async rescanPackages(
    packages: { pkgname: string; pkgType: string }[],
  ): Promise<{ rescanned: number; failed: string[] }> {
    const secretMirrorUrl = this.configService.get<string>('app.secretMirrorUrl');
    if (!secretMirrorUrl) throw new ConflictException('SECRET_MIRROR_URL is not configured');

    const tempDir = await mkdtemp(join(tmpdir(), 'admin-rescan-'));
    const failed: string[] = [];
    let rescanned = 0;

    try {
      for (const entry of packages) {
        try {
          if (entry.pkgType === PKG_TYPE_ARCH) {
            await this.rescanArchPackage(entry.pkgname, secretMirrorUrl, tempDir);
          } else {
            await this.rescanChaoticPackage(entry.pkgname, secretMirrorUrl, tempDir);
          }
          rescanned++;
        } catch (err: unknown) {
          failed.push(`${entry.pkgname}: ${errorMessage(err)}`);
        }
      }
      await this.signalScanService.recomputeBroken();
    } finally {
      const { rm } = await import('node:fs/promises');
      await rm(tempDir, { recursive: true, force: true });
    }

    this.logger.log(`Rescanned ${rescanned} package(s), ${failed.length} failed`);
    return { rescanned, failed };
  }

  private async rescanArchPackage(pkgname: string, secretMirrorUrl: string, tempDir: string): Promise<void> {
    const pkg = await this.archPackageRepository.findOne({ where: { pkgname } });
    if (!pkg) throw new NotFoundException('not found');

    const filename = (pkg.metadata as { filename?: string } | null)?.filename;
    if (!filename || !pkg.version) throw new Error('no filename/version');

    const file = join(tempDir, filename);
    await this.downloadPackage(secretMirrorUrl, pkg.pkgname, filename, file);
    await this.signalScanService.scanPackages([
      { file, pkgType: TriggerType.ARCH, pkgId: pkg.id, version: pkg.version },
    ]);
  }

  private async rescanChaoticPackage(pkgname: string, secretMirrorUrl: string, tempDir: string): Promise<void> {
    const pkg = await this.packageRepository.findOne({
      where: { pkgname },
      relations: { repo: true },
    });
    if (!pkg) throw new NotFoundException('not found');
    if (pkg.skipSignalScan) throw new Error('skip signal scan is enabled');

    const filename = (pkg.metadata as { filename?: string } | null)?.filename;
    if (!filename || !pkg.version || !pkg.repo?.name) throw new Error('no filename/version/repo');

    const file = join(tempDir, filename);
    await this.downloadPackage(secretMirrorUrl, pkg.repo.name, filename, file);
    await this.signalScanService.scanPackages([
      { file, pkgType: TriggerType.CHAOTIC, pkgId: pkg.id, version: pkg.version },
    ]);
  }

  private async downloadPackage(mirrorUrl: string, repoName: string, filename: string, dest: string): Promise<void> {
    const url = `${mirrorUrl}/${repoName}/x86_64/${filename}`;
    const { data } = await this.httpService.axiosRef({ url, method: 'GET', responseType: 'arraybuffer' });
    await writeFile(dest, Buffer.from(data));
  }

  /**
   * Resolve trigger names for bump rows. Arch and Chaotic ids come from
   * independent sequences, so a row's trigger must be looked up in the table
   * its triggerFrom names — resolving one table first would shadow colliding
   * ids from the other (e.g. arch "harfbuzz" shown as chaotic "wired").
   */
  private toPackageBumpDto(row: PackageBumpEntity, triggerNames: Map<number, string>): PackageBump {
    return {
      id: row.id,
      bumpType: row.bumpType,
      trigger: row.trigger,
      triggerFrom: row.triggerFrom,
      details: row.details ?? [],
      timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : new Date(row.timestamp).toISOString(),
      pkgname: row.pkg?.pkgname ?? (row as unknown as { pkgname?: string }).pkgname,
      triggerName: triggerNames.get(row.trigger),
    };
  }

  private async resolveTriggerNames(rows: PackageBumpEntity[]): Promise<Map<number, string>> {
    const archIds = [...new Set(rows.filter((row) => row.triggerFrom === TriggerType.ARCH).map((row) => row.trigger))];
    const chaoticIds = [
      ...new Set(rows.filter((row) => row.triggerFrom === TriggerType.CHAOTIC).map((row) => row.trigger)),
    ];
    const [arch, chaotic] = await Promise.all([
      archIds.length ? this.archPackageRepository.findBy({ id: In(archIds) }) : Promise.resolve([]),
      chaoticIds.length ? this.packageRepository.findBy({ id: In(chaoticIds) }) : Promise.resolve([]),
    ]);
    const names = new Map<number, string>();
    for (const pkg of [...arch, ...chaotic]) names.set(pkg.id, pkg.pkgname);
    return names;
  }

  /** Resolve the pkgIds (split by pkgType) whose package name matches a search. */
  private async resolveElfPackageIdsByName(q: string): Promise<{ arch: number[]; chaotic: number[] }> {
    const [arch, chaotic] = await Promise.all([
      this.archPackageRepository.find({ where: { pkgname: ILike(`%${q}%`) }, select: { id: true } }),
      this.packageRepository.find({ where: { pkgname: ILike(`%${q}%`) }, select: { id: true } }),
    ]);
    return {
      arch: arch.map((pkg) => pkg.id),
      chaotic: chaotic.map((pkg) => pkg.id),
    };
  }

  /** Resolve package names for ELF rows, keyed by packageKey(pkgType, pkgId). */
  private async resolveElfPackageNames(rows: PackageElfAnalysis[]): Promise<Map<PackageKey, string>> {
    const names = new Map<PackageKey, string>();
    if (rows.length === 0) return names;

    const archIds = rows.filter((row) => row.pkgType === PKG_TYPE_ARCH).map((row) => row.pkgId);
    const chaoticIds = rows.filter((row) => row.pkgType === PKG_TYPE_CHAOTIC).map((row) => row.pkgId);

    if (archIds.length > 0) {
      for (const pkg of await this.archPackageRepository.find({ where: { id: In(archIds) } })) {
        names.set(packageKey(PKG_TYPE_ARCH, pkg.id), pkg.pkgname);
      }
    }
    if (chaoticIds.length > 0) {
      for (const pkg of await this.packageRepository.find({ where: { id: In(chaoticIds) } })) {
        names.set(packageKey(PKG_TYPE_CHAOTIC, pkg.id), pkg.pkgname);
      }
    }
    return names;
  }

  private toElfAnalysisView(row: PackageElfAnalysis): AdminPackageElfAnalysis {
    return {
      id: row.id,
      pkgType: row.pkgType,
      pkgId: row.pkgId,
      version: row.version,
      broken: row.broken,
      brokenReasons: row.brokenReasons ?? [],
      hasCompiledCode: row.hasCompiledCode,
      isSourceCompiled: row.isSourceCompiled,
      scannedAt: row.scannedAt.toISOString(),
    };
  }

  private encryptRepoToken(token: string): string {
    return encryptAes(token, this.configService.getOrThrow<string>('app.dbKey'));
  }

  private async findRepo(id: number): Promise<Repo> {
    const repo = await this.repoRepository.findOne({ where: { id } });
    if (!repo) throw new NotFoundException(`Repo ${id} not found`);
    return repo;
  }

  private async deleteEntity(deleteRow: () => Promise<unknown>, label: string): Promise<void> {
    try {
      const result = await deleteRow();
      if (Array.isArray(result)) throw new NotFoundException(`${label} not found`);
      const affected = (result as { affected?: number }).affected;
      if (affected === undefined || affected === 0) throw new NotFoundException(`${label} not found`);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      if (
        error instanceof Error &&
        'code' in error &&
        INTEGRITY_VIOLATION_CODES.has((error as { code: string }).code)
      ) {
        throw new ConflictException(`${label} is still referenced by other rows and cannot be deleted`);
      }
      throw error;
    }
  }
}
