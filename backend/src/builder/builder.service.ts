import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import IORedis from "ioredis";
import { type Context, Service, ServiceBroker } from "moleculer";
import type { Repository } from "typeorm";
import { generateNodeId } from "../functions";
import { Build, Builder, Package, Repo } from "./builder.entity";
import { brokerConfig, MoleculerConfigCommonService } from "./moleculer.config";
import type { BuilderDbConnections, MoleculerBuildObject } from "../types";
import { Mutex } from "async-mutex";
import { REDIS_OPTIONS } from "../constants";

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
    ) {
        Logger.log("BuilderService created", "BuilderService");

        try {
            this.connection = new IORedis(REDIS_OPTIONS.port, REDIS_OPTIONS.host, {
                lazyConnect: true,
                maxRetriesPerRequest: null,
                password: REDIS_OPTIONS.password,
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
}

/**
 * The metrics service that provides the metrics actions for other services to call.
 */
export class BuilderDatabaseService extends Service {
    private dbConnections: BuilderDbConnections
    private builderMutex = new Mutex();
    private repoMutex = new Mutex();
    private packageMutex = new Mutex();

    constructor(broker: ServiceBroker, dbConnections: BuilderDbConnections) {
        super(broker);

        this.parseServiceSchema({
            name: "builderDatabaseService",
            events: {
                "builds.*"(ctx:Context<MoleculerBuildObject>) {
                        this.logBuild(ctx);
                },
            },
            ...MoleculerConfigCommonService,
        });

        this.dbConnections = dbConnections;
        Logger.log("BuilderDatabaseService created", "BuilderDatabaseService");
    }

    async logBuild(ctx: Context): Promise<void> {
        const params = ctx.params as MoleculerBuildObject;

        const builder: Builder = await this.builderExists(params.builder_name);
        const repo: Repo = await this.repoExists(params.target_repo);
        const pkg: Package = await this.pkgnameExists(params.pkgname);

        pkg.lastUpdated = new Date().toISOString();

        const build: Partial<Build> = {
            arch: params.arch,
            buildClass: params.build_class ? params.build_class.toString() : null,
            builder: builder,
            logUrl: params.logUrl,
            timeToEnd: params.duration,
            commit: params.commit.split(":")[0],
            pkgbase: pkg,
            repo: repo,
            status: params.status,
            replaced: params.replaced,
        }

        try {
            Logger.debug(await this.dbConnections.build.save(build), "BuilderDatabaseService");
        } catch(err: unknown){
            Logger.error(err, "BuilderDatabaseService");
        }
    }

    private async pkgnameExists(pkgname: string): Promise<Package> {
        return this.packageMutex.runExclusive(async () => {
            try {
                const packages: Package[] = await this.dbConnections.package.find({ where: { pkgname } });
                let packageExists: Package = packages.find((pkg) => { return pkgname === pkg.pkgname });

                if (packageExists === undefined) {
                    Logger.warn(`Builder ${pkgname} not found in database, creating new entry`, "BuilderDatabaseService");
                    packageExists = await this.dbConnections.package.save({
                        pkgname: pkgname,
                    });
                }

                return packageExists;
            } catch(err: unknown) {
                Logger.error(err, "BuilderDatabaseService");
            }
        });
    }

    /**
     * Check if a builder exists in the database, if not create a new entry
     * @param name The name of the builder
     * @returns The builder object itself
     * @private
     */
    private async builderExists(name: string): Promise<Builder> {
        return this.builderMutex.runExclusive(async () => {
            try {
                const builders: Builder[] = await this.dbConnections.builder.find({ where: { name } });
                let builderExists: Builder = builders.find((builder) => { return name === builder.name });

                if (builderExists === undefined) {
                    Logger.warn(`Builder ${name} not found in database, creating new entry`, "BuilderDatabaseService");
                    builderExists = await this.dbConnections.builder.save({
                        name: name,
                        isActive: false,
                        description: `Added on ${new Date().toISOString()}`
                    });
                }

                return builderExists;
            } catch(err: unknown) {
                Logger.error(err, "BuilderDatabaseService");
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
        return this.repoMutex.runExclusive(async () => {
            try {
                const repos: Repo[] = await this.dbConnections.repo.find({ where: { name: name } });
                let repoExists: Repo = repos.find((repo) => { return name === repo.name });

                if (repoExists === undefined) {
                    Logger.warn(`Repo ${name} not found in database, creating new entry`, "BuilderDatabaseService");
                    repoExists = await this.dbConnections.repo.save({
                        name: name,
                    });
                }

                return repoExists;
            } catch(err: unknown) {
                Logger.error(err, "BuilderDatabaseService");
            }
        });
    }
}
