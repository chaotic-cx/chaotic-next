export const MoleculerConfigCommon = {
    skipProcessEventRegistration: true,
    trackContext: true,
};

export function MoleculerConfigLog(NODE_ENV: string) {
    const isProd = NODE_ENV === "production";
    return {
        type: "Console",
        options: {
            autoPadding: true,
            colors: true,
            formatter: "{timestamp} {level} {mod}: {msg}",
            level: {
                "*": isProd ? "warn" : "debug",
                BROKER: isProd ? "warn" : "debug",
                BUILD: isProd ? "info" : "debug",
                CHAOTIC: isProd ? "info" : "debug",
                NOTIFIER: isProd ? "warn" : "debug",
                REGISTRY: isProd ? "warn" : "debug",
                TRANSIT: isProd ? "warn" : "debug",
                TRANSPORTER: isProd ? "error" : "debug",
            },
            moduleColors: true,
            objectPrinter: null,
        },
    };
}

export const MoleculerConfigCommonService = {
    settings: {
        $noVersionPrefix: true,
    },
    version: 1,
};

export function brokerConfig(nodeID: string, connection: any): any {
    return {
        logger: MoleculerConfigLog(process.env.NODE_ENV || "development"),
        nodeID: nodeID,
        metadata: {
            build_class: 0,
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
