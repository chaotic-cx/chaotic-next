import { registerAs } from "@nestjs/config";

export default registerAs("app", () => ({
    port: process.env.CAUR_PORT ?? 3000,
    host: process.env.CAUR_HOST ?? "localhost",
}));
