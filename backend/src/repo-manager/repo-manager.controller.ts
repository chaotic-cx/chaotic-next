import { Controller, Get } from "@nestjs/common";
import { RepoManagerService } from "./repo-manager.service";
import { AllowAnonymous } from "../auth/anonymous.decorator";

@Controller("repo")
export class RepoManagerController {
    constructor(private repoManager: RepoManagerService) {}

    @Get("run")
    run(): void {
        void this.repoManager.run();
    }
}
