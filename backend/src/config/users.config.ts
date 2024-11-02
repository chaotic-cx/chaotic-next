import { registerAs } from "@nestjs/config";

export default registerAs("users", () => ({
    users: process.env.CAUR_USERS ?? "[]",
}));
