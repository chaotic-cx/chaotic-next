import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { Build, Builder, Repo } from "./builder.entity";
import IORedis from "ioredis";
import { type LoggerInstance, Service, ServiceBroker } from "moleculer";
import { brokerConfig, MoleculerConfigCommonService } from "./moleculer.config";

@Injectable()
export class BuilderService {
    private readonly broker: ServiceBroker;

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
        this.broker = new ServiceBroker(brokerConfig("builder", connection));
        this.broker.createService(new BuilderDatabaseService(this.broker));
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
    private metricsLogger: LoggerInstance = this.broker.getLogger("BUILDER");

    constructor(broker: ServiceBroker) {
        super(broker);

        this.parseServiceSchema({
            name: "builderDatabaseService",
            actions: {
                getMetrics: this.getMetrics,
            },
            events: {
                "user.created"(ctx: any) {
                    ctx.emit("accounts.created", { user: ctx.params.user });
                },
            },
            ...MoleculerConfigCommonService,
        });

        this.metricsLogger.info("BuilderDatabaseService created");
    }

    getMetrics() {
        this.metricsLogger.info("Getting metrics");
    }
}
