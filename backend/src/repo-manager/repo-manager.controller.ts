import { Controller, Get } from "@nestjs/common";
import { RepoManagerService } from "./repo-manager.service";
import { AllowAnonymous } from "../auth/anonymous.decorator";

@Controller("repo")
export class RepoManagerController {
    constructor(private repoManager: RepoManagerService) {}

    @AllowAnonymous()
    @Get("test")
    test(): void {
        this.repoManager.test();
    }
}
