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
    async getBuilds(
        @Query("builder") builder: string,
        @Query("offset", new ParseIntPipe({ optional: true })) offset = 0,
        @Query("amount", new ParseIntPipe({ optional: true })) amount = 50,
    ): Promise<Build[]> {
        return this.builderService.getBuilds({ builder, offset, amount });
    }

    @AllowAnonymous()
    @Get("latest")
    async getLatestBuilds(
        @Query("amount", new ParseIntPipe({ optional: true })) amount = 50,
        @Query("offset", new ParseIntPipe({ optional: true })) offset = 0,
    ): Promise<Build[]> {
        return this.builderService.getLastBuilds({ amount, offset });
    }

    @AllowAnonymous()
    @Get("latest/:pkgname")
    async getLatestBuildsByPkgname(
        @Param("pkgname") pkgname: string,
        @Query("offset", new ParseIntPipe({ optional: true })) offset = 0,
        @Query("amount", new ParseIntPipe({ optional: true })) amount = 30,
    ): Promise<Build[]> {
        return this.builderService.getLastBuildsForPackage({ pkgname, amount, offset });
    }

    @AllowAnonymous()
    @Get("latest/:pkgname/:amount")
    async getLatestBuildsByPkgnameWithAmount(
        @Param("pkgname") pkgname: string,
        @Param("days", ParseIntPipe) days: number,
        @Query("offset", new ParseIntPipe({ optional: true })) offset = 0,
    ): Promise<Build[]> {
        return this.builderService.getLastBuildsForPackage({ pkgname, amount: days, offset });
    }

    @AllowAnonymous()
    @Get("count/:pkgname")
    async getLatestBuildsCountByPkgname(@Param("pkgname") pkgname: string): Promise<number> {
        return this.builderService.getLastBuildsCountForPackage(pkgname);
    }

    @AllowAnonymous()
    @Get("count/:pkgname/:amount")
    async getBuildsCountByPkgnamePerDay(
        @Param("pkgname") pkgname: string,
        @Param("amount", new ParseIntPipe({ optional: true })) amount = 50,
        @Query("offset", new ParseIntPipe({ optional: true })) offset = 0,
    ): Promise<{ day: string; count: string }[]> {
        return this.builderService.getBuildsCountByPkgnamePerDay({ pkgname, amount, offset });
    }

    @AllowAnonymous()
    @Get("popular/:amount")
    async getPopularPackages(
        @Param("amount", ParseIntPipe) amount: number,
        @Query("offset", new ParseIntPipe({ optional: true })) offset = 0,
        @Query("status", new ParseIntPipe({ optional: true })) status?: number,
    ): Promise<{ pkgname: string; count: string }[]> {
        return this.builderService.getPopularPackages({ amount, offset, status });
    }

    /**
     * Returns the number of builds per builder.
     */
    @AllowAnonymous()
    @Get("builders/amount")
    async getBuildersAmount(): Promise<{ builderId: string; count: string }[]> {
        return this.builderService.getBuildsPerBuilder();
    }
}

