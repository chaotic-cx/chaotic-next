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
        return await this.builderService.getBuilders();
    }

    @AllowAnonymous()
    @Get("packages")
    async getPackages(): Promise<Package[]> {
        return await this.builderService.getPackages();
    }

    @AllowAnonymous()
    @Get("repos")
    async getRepos(): Promise<Repo[]> {
        return await this.builderService.getRepos();
    }

    @AllowAnonymous()
    @Get("builds")
    async getBuilds(
        @Query("builder") builder: string,
        @Query("offset", new ParseIntPipe({ optional: true })) offset = 0,
        @Query("amount", new ParseIntPipe({ optional: true })) amount = 50,
    ): Promise<Build[]> {
        return await this.builderService.getBuilds({ builder, offset, amount });
    }

    @AllowAnonymous()
    @Get("latest")
    async getLatestBuilds(
        @Query("amount", new ParseIntPipe({ optional: true })) amount = 50,
        @Query("offset", new ParseIntPipe({ optional: true })) offset = 0,
    ): Promise<Build[]> {
        return await this.builderService.getLastBuilds({ amount, offset });
    }

    @AllowAnonymous()
    @Get("latest/:pkgname")
    async getLatestBuildsByPkgname(
        @Param("pkgname") pkgname: string,
        @Query("offset", new ParseIntPipe({ optional: true })) offset = 0,
        @Query("amount", new ParseIntPipe({ optional: true })) amount = 30,
    ): Promise<Build[]> {
        return await this.builderService.getLastBuildsForPackage({ pkgname, amount, offset });
    }

    @AllowAnonymous()
    @Get("latest/:pkgname/:amount")
    async getLatestBuildsByPkgnameWithAmount(
        @Param("pkgname") pkgname: string,
        @Param("days", ParseIntPipe) days: number,
        @Query("offset", new ParseIntPipe({ optional: true })) offset = 0,
    ): Promise<Build[]> {
        return await this.builderService.getLastBuildsForPackage({ pkgname, amount: days, offset });
    }

    @AllowAnonymous()
    @Get("count/days")
    async getBuildsPerPackage(): Promise<{ pkgbase: string; count: string }[]> {
        return await this.builderService.getBuildsPerPackage();
    }

    @AllowAnonymous()
    @Get("count/days/:days")
    async getBuildsPerPackageWithDays(
        @Param("days", ParseIntPipe) days: number,
    ): Promise<{ pkgbase: string; count: string }[]> {
        return await this.builderService.getBuildsPerPackage({ days });
    }

    @AllowAnonymous()
    @Get("count/package/:pkgname")
    async getLatestBuildsCountByPkgname(@Param("pkgname") pkgname: string): Promise<number> {
        return await this.builderService.getLastBuildsCountForPackage(pkgname);
    }

    @AllowAnonymous()
    @Get("count/:pkgname/:amount")
    async getBuildsCountByPkgnamePerDay(
        @Param("pkgname") pkgname: string,
        @Param("amount", new ParseIntPipe({ optional: true })) amount = 50,
        @Query("offset", new ParseIntPipe({ optional: true })) offset = 0,
    ): Promise<{ day: string; count: string }[]> {
        return await this.builderService.getBuildsCountByPkgnamePerDay({ pkgname, amount, offset });
    }

    @AllowAnonymous()
    @Get("popular/:amount")
    async getPopularPackages(
        @Param("amount", ParseIntPipe) amount: number,
        @Query("offset", new ParseIntPipe({ optional: true })) offset = 0,
        @Query("status", new ParseIntPipe({ optional: true })) status?: number,
    ): Promise<{ pkgname: string; count: string }[]> {
        return await this.builderService.getPopularPackages({ amount, offset, status });
    }

    /**
     * Returns the number of builds per builder.
     */
    @AllowAnonymous()
    @Get("builders/amount")
    async getBuildersAmount(): Promise<{ builderId: string; count: string }[]> {
        return await this.builderService.getBuildsPerBuilder();
    }

    @AllowAnonymous()
    @Get("per-day/pkgname/:pkgname/:days")
    async getBuildsPerDayDefault(
        @Param("pkgname") pkgname: string,
        @Param("days", ParseIntPipe) days: number,
        @Query("offset", new ParseIntPipe({ optional: true })) offset: number,
    ): Promise<
        {
            day: string;
            count: string;
        }[]
    > {
        return await this.builderService.getBuildsCountByPkgnamePerDay({ offset, pkgname, amount: days });
    }

    @AllowAnonymous()
    @Get("per-day/:days")
    async getBuildsPerDay(@Param("days", ParseIntPipe) days: number): Promise<{ day: string; count: string }[]> {
        return await this.builderService.getBuildsPerDay({ days: days });
    }

    @AllowAnonymous()
    @Get("latest/url/:amount")
    async getLatestBuildsByPkgnameWithUrls(
        @Param("amount", new ParseIntPipe({ optional: true })) amount = 50,
        @Query("offset", new ParseIntPipe({ optional: true })) offset = 0,
    ): Promise<{ commit: string; logUrl: string; pkgname: string; timeToEnd: string; version: string }[]> {
        return await this.builderService.getLatestBuilds({ amount, offset });
    }

    @AllowAnonymous()
    @Get("average/time")
    async getAverageBuildTimePerStatus(): Promise<
        {
            average_build_time: string;
            status: string;
        }[]
    > {
        return await this.builderService.getAverageBuildTimePerStatus();
    }
}
