export enum BuildStatus {
    SUCCESS = 0,
    ALREADY_BUILT = 1,
    SKIPPED = 2,
    FAILED = 3,
    TIMED_OUT = 4,
    CANCELED = 5,
    CANCELED_REQUEUE = 6,
    SOFTWARE_FAILURE = 7,
}

export const PG_OPTIONS = {
    host: process.env.PG_HOST || "localhost",
    port: Number(process.env.PG_PORT) || 5432,
    username: process.env.PG_USER || "chaotic",
    password: process.env.PG_PASSWORD || "chaotic",
    database: process.env.PG_DATABASE || "chaotic",
    entities: [`${__dirname}/*/*.entity.{js,ts}`],
    synchronize: process.env.NODE_ENV === "development",
};
