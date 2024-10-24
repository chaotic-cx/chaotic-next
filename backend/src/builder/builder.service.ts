import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import IORedis from "ioredis";
import { type Context, Service, ServiceBroker } from "moleculer";
import type { Repository } from "typeorm";
import { generateNodeId } from "../functions";
import { Build, Builder, Repo } from "./builder.entity";
import { brokerConfig, MoleculerConfigCommonService } from "./moleculer.config";
import type { MoleculerEmitObject } from "../types";
import { Mutex } from "async-mutex";

@Injectable()
export class BuilderService {
    private broker: ServiceBroker;

    constructor(
        @InjectRepository(Build)
        private buildRepository: Repository<Build>,
        @InjectRepository(Builder)
        private builderRepository: Repository<Builder>,
        @InjectRepository(Repo)
        private repoRepository: Repository<Repo>,
    ) {
        Logger.debug("BuilderService created");

        const redisHost = process.env.REDIS_HOST || "localhost";
        const redisPort = Number(process.env.REDIS_PORT) || 6379;
        const redisPassword = process.env.REDIS_PASSWORD || "";

        const connection = new IORedis(redisPort, redisHost, {
            lazyConnect: true,
            maxRetriesPerRequest: null,
            password: redisPassword,
        });

        const dbConnections = {
            build: this.buildRepository,
            builder: this.builderRepository,
            repo: this.repoRepository,
        };

        connection.connect().then(() => {
            this.broker = new ServiceBroker(brokerConfig(generateNodeId(), connection));
            this.broker.createService(new BuilderDatabaseService(this.broker, dbConnections));
            void this.broker.start();
        });
    }

    async addBuilder(builder: Builder) {
        Logger.debug("Creating builder");
        Logger.log(builder, "Builder/Builder");
        return this.builderRepository.save(builder);
    }
}

/**
 * The metrics service that provides the metrics actions for other services to call.
 */
export class BuilderDatabaseService extends Service {
    private builderServiceLogger= this.broker.getLogger("BUILDER");
    private dbConnections: {
        build: Repository<Build>;
        builder: Repository<Builder>;
        repo: Repository<Repo>;
    }
    private builderMutex = new Mutex();
    private repoMutex = new Mutex();

    constructor(broker: ServiceBroker, dbConnections: {
        build: Repository<Build>;
        builder: Repository<Builder>;
        repo: Repository<Repo>;
    }) {
        super(broker);

        this.parseServiceSchema({
            name: "builderDatabaseService",
            actions: {
                getMetrics: this.getMetrics,
            },
            events: {
                "builds.success": {
                    group: "builds",
                    handler(ctx: Context<MoleculerEmitObject>) {
                        this.logBuild(ctx);
                    },
                },
                "builds.canceled-requeue": {
                    group: "builds",
                    handler(ctx: Context<MoleculerEmitObject>) {
                        this.logBuild(ctx);
                    },
                },
                "builds.failed": {
                    group: "builds",
                    handler(ctx: Context<MoleculerEmitObject>) {
                        this.logBuild(ctx);
                    },
                },
                "builds.skipped": {
                    group: "builds",
                    handler(ctx: Context<MoleculerEmitObject>) {
                        this.incCounterBuildSkipped(ctx);
                    },
                },
                "builds.alreadyBuilt": {
                    group: "builds",
                    handler(ctx: Context<MoleculerEmitObject>) {
                        this.logBuild(ctx);
                    },
                },
                "builds.timeout": {
                    group: "builds",
                    handler(ctx: Context<MoleculerEmitObject>) {
                        this.logBuild(ctx);
                    },
                },
                "builds.replaced": {
                    group: "builds",
                    handler(ctx: Context<MoleculerEmitObject>) {
                        this.logBuild(ctx);
                    },
                },
                "builds.canceled": {
                    group: "builds",
                    handler(ctx: Context<MoleculerEmitObject>) {
                        this.logBuild(ctx);
                    },
                },
                "builds.softwareFailure": {
                    group: "builds",
                    handler(ctx: Context<MoleculerEmitObject>) {
                        this.logBuild(ctx);
                    },
                },
            },
            ...MoleculerConfigCommonService,
        });

        this.dbConnections = dbConnections;
        this.builderServiceLogger.info("Created BuilderDatabaseService");
    }

    getMetrics(): void {
        this.builderServiceLogger.info("Getting metrics");
    }

    async logBuild(ctx: Context) {
        const params = ctx.params as MoleculerEmitObject;

        const builder = await this.builderExists(params.builder_name);
        const repo = await this.repoExists(params.target_repo);

        Logger.debug(builder, "Builder/BuilderDatabaseService");
        Logger.debug(repo, "Builder/BuilderDatabaseService");

        const build: Partial<Build> = {
            arch: params.arch,
            buildClass: params.build_class ? params.build_class.toString() : null,
            builder: builder,
            logUrl: params.logUrl,
            timeToEnd: params.duration,
            commit: params.commit.split(":")[0],
            pkgbase: params.pkgname,
            repo: repo,
            status: params.status,
            replaced: params.replaced,
        }

        try {
            Logger.debug(await this.dbConnections.build.save(build), "Builder/BuilderDatabaseService");
        } catch(err: any){
            Logger.error(err, "Builder/BuilderDatabaseService");
        }}

    addBuilder(builder: Builder) {
        this.builderServiceLogger.info(builder);
        this.dbConnections.builder.save(builder);
    }

    /**
     * Check if a builder exists in the database, if not create a new entry
     * @param name The name of the builder
     * @returns The builder object itself
     * @private
     */
    private async builderExists(name: string): Promise<Builder> {
        return await this.builderMutex.runExclusive(async () => {
            try {
                const builders = await this.dbConnections.builder.find({ where: { name } });
                let builderExists = builders.find((builder) => { return name === builder.name });

                if (builderExists === undefined) {
                    this.builderServiceLogger.warn(`Builder ${name} not found in database, creating new entry`);
                    builderExists = await this.dbConnections.builder.save({
                        name: name,
                        isActive: false,
                        description: `Added on ${new Date().toISOString()}`
                    });
                }

                return builderExists;
            } catch(err: any) {
                Logger.error(err, "Builder/BuilderDatabaseService");
            }
        });
    }

    /**
     * Check if a repo exists in the database, if not create a new entry
     * @param name The name of the repo
     * @returns The repo object itself
     * @private
     */
    private async repoExists(name: string): Promise<Repo> {
        return await this.repoMutex.runExclusive(async () => {
            try {
                const repos = await this.dbConnections.repo.find({ where: { name: name } });
                let repoExists = repos.find((repo) => { return name === repo.name });

                if (repoExists === undefined) {
                    this.builderServiceLogger.warn(`Repo ${name} not found in database, creating new entry`);
                    repoExists = await this.dbConnections.repo.save({
                        name: name,
                    });
                }

                return repoExists;
            } catch(err: any) {
                Logger.error(err, "Builder/BuilderDatabaseService");
            }
        });
    }
}
