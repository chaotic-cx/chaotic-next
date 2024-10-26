export const IS_PROD = process.env.NODE_ENV === "production";

export const PG_OPTIONS = {
    host: process.env.PG_HOST || "localhost",
    port: Number(process.env.PG_PORT) || 5432,
    username: process.env.PG_USER || "chaotic",
    password: process.env.PG_PASSWORD || "chaotic",
    database: process.env.PG_DATABASE || "chaotic",
    entities: [`${__dirname}/*/*.entity.{js,ts}`],
    synchronize: !IS_PROD,
};

export const requiredEnvVarsProd: string[] = [
    "CAUR_PORT",
    "CAUR_ROUTER_TOKEN",
    "PG_DATABASE",
    "PG_HOST",
    "PG_PASSWORD",
    "PG_USER",
    "REDIS_PASSWORD",
    "REDIS_SSH_HOST",
    "REDIS_SSH_USER",
    "TELEGRAM_API_HASH",
    "TELEGRAM_API_ID",
    "TELEGRAM_DB_ENCRYPTION_KEY",
];

export const requiredEnvVarsDev: string[] = ["PG_DATABASE", "PG_HOST", "PG_PASSWORD", "PG_USER", "REDIS_PASSWORD"];
