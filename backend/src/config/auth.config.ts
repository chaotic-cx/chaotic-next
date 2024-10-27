import { registerAs } from "@nestjs/config";

export default registerAs("auth", () => ({
    audience: process.env.AUTH0_AUDIENCE,
    clientId: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,
    domain: process.env.AUTH0_DOMAIN,
    jwtSecret: process.env.CAUR_JWT_SECRET,
}));
