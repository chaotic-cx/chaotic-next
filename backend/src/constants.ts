export const PG_OPTIONS = {
    host: process.env.PG_HOST || "localhost",
    port: Number(process.env.PG_PORT) || 5432,
    username: process.env.PG_USER || "chaotic",
    password: process.env.PG_PASSWORD || "chaotic",
    database: process.env.PG_DATABASE || "chaotic",
    entities: [`${__dirname}/*/*.entity.{js,ts}`],
    synchronize: process.env.NODE_ENV === "development",
};

export const REDIS_OPTIONS = {
     host: process.env.REDIS_HOST || "localhost",
     port : Number(process.env.REDIS_PORT) || 6379,
     password:  process.env.REDIS_PASSWORD || ""
}

export const requiredEnvVars: string[] = [
    'CAUR_PORT',
    'CAUR_ROUTER_TOKEN',
    'PG_DATABASE',
    'PG_HOST',
    'PG_PASSWORD',
    'PG_USER',
    'REDIS_PASSWORD',
    'REDIS_SSH_HOST',
    'REDIS_SSH_USER',
    'TELEGRAM_API_HASH',
    'TELEGRAM_API_ID',
    'TELEGRAM_DB_ENCRYPTION_KEY',
];
