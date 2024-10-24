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
