import { registerAs } from "@nestjs/config";
import { IS_PROD } from "../constants";

export default registerAs("app", () => ({
    port: process.env.CAUR_PORT ?? 3000,
    host: process.env.CAUR_HOST ?? "0.0.0.0",
    prod: IS_PROD,
}));
