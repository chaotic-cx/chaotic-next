export const IS_PROD = process.env.NODE_ENV === "production";

export const requiredEnvVarsProd: string[] = [
    "AUTH0_AUDIENCE",
    "AUTH0_CLIENT_ID",
    "AUTH0_CLIENT_SECRET",
    "AUTH0_DOMAIN",
    "CAUR_JWT_SECRET",
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

export const ARCH= "x86_64";
