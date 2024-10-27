import { Controller, Get, Param, ParseIntPipe, Query } from "@nestjs/common";
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
        return this.builderService.getBuilds(builder);
    }

    @AllowAnonymous()
    @Get("latest")
    async getBuild(@Query("days", ParseIntPipe) days: number): Promise<Build[]> {
        return this.builderService.getLastBuilds(days);
    }

    @AllowAnonymous()
    @Get("latest/:pkgname/:days")
    async getBuildByPkgname(
        @Param("pkgname") pkgname: string,
        @Param("days", ParseIntPipe) days: number,
        @Query("offset", new ParseIntPipe({ optional: true })) offset: number,
    ): Promise<Build[]> {
        return this.builderService.getLastBuildsForPackage({ pkgname, days, offset });
    }
}

