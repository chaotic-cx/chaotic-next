import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import IORedis from "ioredis";
import { type Context, Service, ServiceBroker } from "moleculer";
import type { Repository } from "typeorm";
import { generateNodeId } from "../functions";
import { Build, Builder, builderExists, Package, pkgnameExists, Repo, repoExists } from "./builder.entity";
import { brokerConfig, MoleculerConfigCommonService } from "./moleculer.config";
import type { BuilderDbConnections, MoleculerBuildObject } from "../types";
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

    /**
     * Logs a new build to the database.
     * @param ctx The Moleculer context object containing the build object
     */
    async logBuild(ctx: Context<MoleculerBuildObject>): Promise<void> {
        if (ctx.eventName.match(/S+Histogram$/) !== null) return

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
        }

        try {
            Logger.debug(await this.dbConnections.build.save(build), "BuilderDatabaseService");
        } catch(err: unknown){
            Logger.error(err, "BuilderDatabaseService");
        }
    }
}
