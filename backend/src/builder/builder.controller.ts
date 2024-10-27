import { Controller, Get, Query } from "@nestjs/common";
import type { Build, Builder, Package, Repo } from "./builder.entity";
import { BuilderService } from "./builder.service";

@Controller("builder")
export class BuilderController {
    constructor(private builderService: BuilderService) {}

    @Get("builders")
    async getBuilders(): Promise<Builder[]> {
        return this.builderService.getBuilders();
    }

    @Get("packages")
    async getPackages(): Promise<Package[]> {
        return this.builderService.getPackages();
    }

    @Get("repos")
    async getRepos(): Promise<Repo[]> {
        return this.builderService.getRepos();
    }

    @Get("builds")
    async getBuilder(@Query("builder") builder: string): Promise<Build[]> {
        return this.builderService.getBuilds();
    }
}

