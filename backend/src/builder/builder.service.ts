import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import IORedis from "ioredis";
import { type Context, Service, ServiceBroker } from "moleculer";
import type { Repository } from "typeorm";
import { generateNodeId } from "../functions";
import type { BuilderDbConnections, MoleculerBuildObject } from "../types";
import { Build, Builder, Package, Repo, builderExists, pkgnameExists, repoExists } from "./builder.entity";
import { MoleculerConfigCommonService, brokerConfig } from "./moleculer.config";

@Injectable()
export class BuilderService {
    private broker: ServiceBroker;
    private readonly connection: IORedis;

    constructor(
        @InjectRepository(Build)
        private buildRepository: Repository<Build>,
        @InjectRepository(Builder)
        private builderRepository: Repository<Builder>,
        @InjectRepository(Repo)
        private repoRepository: Repository<Repo>,
        @InjectRepository(Package)
        private packageRepository: Repository<Package>,
        private configService: ConfigService,
    ) {
        const redisPassword: string = this.configService.get<string | undefined>("redis.password");
        const redisHost: string = this.configService.get<string>("redis.host");
        const redisPort: number = this.configService.get<number>("redis.port");

        try {
            this.connection = new IORedis(redisPort, redisHost, {
                lazyConnect: true,
                maxRetriesPerRequest: null,
                password: redisPassword,
            });
        } catch (err: unknown) {
            Logger.error(err, "BuilderService");
            return;
        }

        const dbConnections: BuilderDbConnections = {
            build: this.buildRepository,
            builder: this.builderRepository,
            package: this.packageRepository,
            repo: this.repoRepository,
        };

        try {
            this.connection.connect().then(() => {
                this.broker = new ServiceBroker(brokerConfig(generateNodeId(), this.connection));
                this.broker.createService(new BuilderDatabaseService(this.broker, dbConnections));
                void this.broker.start();
            });
        } catch (err: unknown) {
            Logger.error(err, "BuilderService");
        }
    }

    /**
     * Returns all builders from the database.
     */
    async getBuilders(options?: any): Promise<Builder[]> {
        return this.builderRepository.find();
    }

    /**
     * Returns all packages from the database.
     */
    async getPackages(options?: any): Promise<Package[]> {
        return this.packageRepository.find();
    }

    /**
     * Returns all repos from the database.
     */
    async getRepos(options?: any): Promise<Repo[]> {
        return this.repoRepository.find();
    }

    /**
     * Returns all builds from the database.
     */
    async getBuilds(options?: { offset: number; amount: number; builder?: string }): Promise<Build[]> {
        return this.buildRepository
            .createQueryBuilder("build")
            .leftJoinAndSelect("build.pkgbase", "package")
            .leftJoinAndSelect("build.builder", "builder")
            .leftJoinAndSelect("build.repo", "repo")
            .orderBy("build.id", "DESC")
            .skip(options.offset)
            .take(options.amount)
            .getMany();
    }

    /**
     * Returns a build from the database.
     * @param options An object containing the amount to look back and the offset
     * @returns The last n builds, unless an offset is provided
     */
    async getLastBuilds(options: { offset: number; amount: number }): Promise<Build[]> {
        return this.buildRepository
            .createQueryBuilder("build")
            .leftJoinAndSelect("build.pkgbase", "package")
            .leftJoinAndSelect("build.builder", "builder")
            .leftJoinAndSelect("build.repo", "repo")
            .orderBy("build.id", "DESC")
            .skip(options.offset)
            .take(options.amount)
            .getMany();
    }

    /**
     * Returns the last build for a specific package.
     * @param options The package name, amount to look back and offset
     * @returns The last n builds for a specific package
     */
    async getLastBuildsForPackage(options: { pkgname: string; amount: number; offset: number }): Promise<Build[]> {
        return this.buildRepository
            .createQueryBuilder("build")
            .leftJoinAndSelect("build.pkgbase", "package")
            .leftJoinAndSelect("build.builder", "builder")
            .leftJoinAndSelect("build.repo", "repo")
            .where("package.pkgname = :pkgname", { pkgname: options.pkgname })
            .orderBy("build.id", "DESC")
            .skip(options.offset)
            .take(options.amount)
            .getMany();
    }

    /**
     * Returns the build count for a specific package.
     * @param pkgname The package name to look for
     * @returns The build count for a specific package
     */
    getLastBuildsCountForPackage(pkgname: string): Promise<number> {
        return this.buildRepository.count({ where: { pkgbase: { pkgname } } });
    }

    /**
     * Returns the build count for a specific package per day.
     * @param options The package name and amount to look back, or the offset.
     * @returns The build count for a specific package per day
     */
    async getBuildsCountByPkgnamePerDay(options: {
        pkgname: string;
        amount: number;
        offset: number;
    }): Promise<{ day: string; count: string }[]> {
        const { id } = await this.packageRepository.findOne({ where: { pkgname: options.pkgname } });
        return this.buildRepository
            .createQueryBuilder("build")
            .select("DATE_TRUNC('day', build.timestamp) AS day")
            .addSelect("COUNT(*) AS count")
            .where("build.pkgbase = :id", { id })
            .groupBy("day")
            .orderBy("day", "DESC")
            .skip(options.offset)
            .take(options.amount)
            .getRawMany();
    }

    /**
     * Returns the most frequently built packages.
     * @param options The amount and offset, optionally a numeric status, as an object.
     * @returns The most frequently built packages
     */
    getPopularPackages(options: {
        amount: number;
        offset: number;
        status: number;
    }): Promise<{ pkgname: string; count: string }[]> {
        if (options.status) {
            return this.builderRepository
                .createQueryBuilder("build")
                .select("pkgbase.pkgname")
                .addSelect("COUNT(*) AS count")
                .innerJoin("build.pkgbase", "pkgbase")
                .groupBy("pkgbase.pkgname")
                .orderBy("count", "DESC")
                .where("build.status = :status", { status: options.status })
                .skip(options.offset)
                .take(options.amount)
                .getRawMany();
        }
        return this.buildRepository
            .createQueryBuilder("build")
            .select("pkgbase.pkgname")
            .addSelect("COUNT(*) AS count")
            .innerJoin("build.pkgbase", "pkgbase")
            .groupBy("pkgbase.pkgname")
            .orderBy("count", "DESC")
            .skip(options.offset)
            .take(options.amount)
            .getRawMany();
    }

    /**
     * Returns the number of builds per builder.
     * @returns The number of builds per builder
     */
    getBuildsPerBuilder(): Promise<{ builderId: string; count: string }[]> {
        return this.buildRepository
            .createQueryBuilder("build")
            .select("build.builder")
            .addSelect("COUNT(*) AS count")
            .innerJoin("build.builder", "builder")
            .groupBy("build.builder")
            .getRawMany();
    }
}


/**
 * The metrics service that provides the metrics actions for other services to call.
 */
export class BuilderDatabaseService extends Service {
    private dbConnections: BuilderDbConnections;

    constructor(broker: ServiceBroker, dbConnections: BuilderDbConnections) {
        super(broker);

        this.parseServiceSchema({
            name: "builderDatabaseService",
            events: {
                "builds.*"(ctx: Context<MoleculerBuildObject>) {
                    this.logBuild(ctx);
                },
                "database.removalCompleted"(ctx: Context<string[]>) {
                    this.removeEntries(ctx);
                },
            },
            ...MoleculerConfigCommonService,
        });

        this.dbConnections = dbConnections;
        Logger.log("BuilderDatabaseService created", "BuilderDatabaseService");
    }

    /**
     * Logs a new build to the database.
     * @param ctx The Moleculer context object containing the build object
     */
    async logBuild(ctx: Context<MoleculerBuildObject>): Promise<void> {
        // These events are not relevant as they miss required data
        if (ctx.eventName.match(/Histogram$/) !== null) return;

        const params = ctx.params as MoleculerBuildObject;

        // No point in logging if the required fields are missing. Database will throw an error anyway.
        if (!params.builder_name || !params.target_repo || !params.pkgname) {
            Logger.error("Missing required fields, throwing entry away", "BuilderDatabaseService");
            return;
        }

        const relations: [Builder, Repo, Package] = await Promise.all([
            builderExists(params.builder_name, this.dbConnections.builder),
            repoExists(params.target_repo, this.dbConnections.repo),
            pkgnameExists(params.pkgname, this.dbConnections.package),
        ]);

        if (relations.includes(null)) {
            Logger.error("Invalid relations, throwing entry away", "BuilderDatabaseService");
            return;
        }

        relations[2].lastUpdated = new Date().toISOString();

        const build: Partial<Build> = {
            arch: params.arch,
            buildClass: params.build_class ? params.build_class.toString() : null,
            builder: relations[0],
            logUrl: params.logUrl,
            timeToEnd: params.duration,
            commit: params.commit.split(":")[0],
            pkgbase: relations[2],
            repo: relations[1],
            status: params.status,
            replaced: params.replaced,
        };

        try {
            Logger.debug(await this.dbConnections.build.save(build), "BuilderDatabaseService");
        } catch (err: unknown) {
            Logger.error(err, "BuilderDatabaseService");
        }
    }

    /**
     * Removes entries from the database.
     * @param ctx The Moleculer context object containing the package names to remove
     */
    async removeEntries(ctx: Context<string[]>): Promise<void> {
        const pkgbases = ctx.params as string[];

        try {
            for (const pkgbase of pkgbases) {
                const pkg = await this.dbConnections.package.findOne({ where: { pkgname: pkgbase } });
                if (pkg) {
                    await this.dbConnections.package.update(pkg.id, {
                        isActive: false,
                        lastUpdated: new Date().toISOString(),
                    });
                }
            }
        } catch (err: unknown) {
            Logger.error(err, "BuilderDatabaseService");
        }
    }
}
