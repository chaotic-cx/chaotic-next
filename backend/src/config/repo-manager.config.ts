import { registerAs } from "@nestjs/config";

export default registerAs("repoMan", () => ({
    gitlabToken: process.env.GITLAB_TOKEN,
    gitAuthor: process.env.GIT_AUTHOR ?? "Chaotic Temeraire",
    gitEmail: process.env.GIT_EMAIL ?? "ci@chaotic.cx",
    gitUsername: process.env.GIT_USERNAME ?? "git",
    schedulerInterval: process.env.REPOMANAGER_SCHEDULE ?? "0 * * * *",
    alwaysRebuild: process.env.REPOMANAGER_ALWAYS_REBUILD ?? "{}",
}));
