import { registerAs } from "@nestjs/config";

export default registerAs("repoMan", () => ({
    alwaysRebuild: process.env.REPOMANAGER_ALWAYS_REBUILD ?? "{}",
    gitAuthor: process.env.GIT_AUTHOR ?? "Chaotic Temeraire",
    gitEmail: process.env.GIT_EMAIL ?? "ci@chaotic.cx",
    gitUsername: process.env.GIT_USERNAME ?? "git",
    gitlabToken: process.env.CAUR_GITLAB_TOKEN,
    schedulerInterval: process.env.REPOMANAGER_SCHEDULE ?? "0 * * * *",
}));
