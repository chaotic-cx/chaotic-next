import type IORedis from "ioredis";
import type { BrokerOptions, LoggerConfig, ServiceSchema } from "moleculer";

export const MoleculerConfigCommon: Partial<BrokerOptions> = {
    skipProcessEventRegistration: true,
};

export function MoleculerConfigLog(): LoggerConfig {
    const isProd: boolean = process.env.NODE_ENV === "production";
    return {
        type: "Pino",
        options: {
            level: isProd ? "info" : "debug",
        },
    };
}

export const MoleculerConfigCommonService: Partial<ServiceSchema> = {
    settings: {
        $noVersionPrefix: true,
    },
    version: 1,
};

export function brokerConfig(nodeID: string, connection: IORedis): BrokerOptions {
    return {
        logger: MoleculerConfigLog(),
        nodeID: nodeID,
        metadata: {
            version: 1,
        },
        transporter: {
            type: "Redis",
            options: {
                host: connection.options.host,
                port: connection.options.port,
                password: connection.options.password,
            },
        },
        ...MoleculerConfigCommon,
    };
}
