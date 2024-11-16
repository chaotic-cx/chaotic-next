import { registerAs } from "@nestjs/config";

export default registerAs("repoMan", () => ({
    gitAuthor: process.env.GIT_AUTHOR ?? "Temeraire",
    gitEmail: process.env.GIT_EMAIL ?? "ci@chaotic.cx",
    gitUsername: process.env.GIT_USERNAME ?? "git",
    gitlabToken: process.env.CAUR_GITLAB_TOKEN,
    globalBlacklist: process.env.REPOMANAGER_NEVER_REBUILD ?? "[]",
    globalTriggers: process.env.REPOMANAGER_ALWAYS_REBUILD ?? "[]",
    regenDatabase: process.env.REPOMANAGER_REGEN_DB ?? false,
    schedulerInterval: process.env.REPOMANAGER_SCHEDULE ?? "0 * * * *",
}));
