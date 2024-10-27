import { registerAs } from "@nestjs/config";

export default registerAs("router", () => ({
    token: process.env.CAUR_ROUTER_TOKEN,
}));
