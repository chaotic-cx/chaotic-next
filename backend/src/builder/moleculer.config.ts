import type IORedis from "ioredis";
import type { BrokerOptions, LoggerConfig, ServiceSchema } from "moleculer";

export const MoleculerConfigCommon: Partial<BrokerOptions> = {
    skipProcessEventRegistration: true,
};

export function MoleculerConfigLog(NODE_ENV: string): LoggerConfig {
    const isProd: boolean = NODE_ENV === "production";
    return {
        type: "Console",
        options: {
            autoPadding: false,
            colors: true,
            formatter: "{timestamp} {level} {mod}: {msg}",
            level: {
                "*": isProd ? "error" : "debug",
                BROKER: isProd ? "error" : "debug",
                BUILD: isProd ? "error" : "debug",
                NOTIFIER: isProd ? "error" : "debug",
                REGISTRY: isProd ? "error" : "debug",
                TRANSIT: isProd ? "error" : "debug",
                TRANSPORTER: isProd ? "error" : "debug",
            },
            moduleColors: true,
            objectPrinter: null,
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
        logger: MoleculerConfigLog(process.env.NODE_ENV || "development"),
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
