import { registerAs } from "@nestjs/config";

export default registerAs("repoMan", () => ({
    gitlabToken: process.env.GITLAB_TOKEN,
}));
