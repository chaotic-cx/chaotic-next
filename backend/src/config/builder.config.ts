import { registerAs } from "@nestjs/config";

export default registerAs("redis", () => ({
    host: process.env.REDIS_HOST ?? "localhost",
    port: process.env.REDIS_PORT ?? 6379,
    password: process.env.REDIS_PASSWORD ?? undefined,
}));
