import { Controller, Get, Query } from "@nestjs/common";
import { AllowAnonymous } from "../auth/anonymous.decorator";
import type { Build, Builder, Package, Repo } from "./builder.entity";
import { BuilderService } from "./builder.service";

@Controller("builder")
export class BuilderController {
    constructor(private builderService: BuilderService) {}

    @AllowAnonymous()
    @Get("builders")
    async getBuilders(): Promise<Builder[]> {
        return this.builderService.getBuilders();
    }

    @AllowAnonymous()
    @Get("packages")
    async getPackages(): Promise<Package[]> {
        return this.builderService.getPackages();
    }

    @AllowAnonymous()
    @Get("repos")
    async getRepos(): Promise<Repo[]> {
        return this.builderService.getRepos();
    }
    
    @AllowAnonymous()
    @Get("builds")
    async getBuilder(@Query("builder") builder: string): Promise<Build[]> {
        return this.builderService.getBuilds();
    }
}

