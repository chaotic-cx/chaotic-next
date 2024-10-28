import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post } from "@nestjs/common";
import type { RouterHitBody } from "../types";
import type { RouterHit, RouterHitColumns } from "./router.entity";
import { RouterHitColumPipe } from "./router.pipe";
import { RouterService } from "./router.service";

@Controller("router")
export class RouterController {
    constructor(private routerService: RouterService) {}

    @HttpCode(HttpStatus.OK)
    @Post("hit")
    async hitRouter(@Body() body: RouterHitBody): Promise<void> {
        return this.routerService.hitRouter(body);
    }

    @HttpCode(HttpStatus.OK)
    @Get("/:days/:type")
    async getRouterStats(
        @Param("type", RouterHitColumPipe) type: RouterHitColumns,
        @Param("days", ParseIntPipe) days: number,
    ): Promise<RouterHit[]> {
        return this.routerService.getGeneralStats(days, type);
    }

    @HttpCode(HttpStatus.OK)
    @Get("/country/:days")
    async getRouterStatsDefault(
        @Param("days", ParseIntPipe) days: number,
    ): Promise<{ country: string; count: number }[]> {
        return this.routerService.getCountryStats(days);
    }

    @HttpCode(HttpStatus.OK)
    @Get("/mirror/:days")
    async getRouterStatsMirror(
        @Param("days", ParseIntPipe) days: number,
    ): Promise<{ mirror: string; count: number }[]> {
        return this.routerService.getMirrorStats(days);
    }

    @HttpCode(HttpStatus.OK)
    @Get("/package/:days")
    async getRouterStatsPackage(
        @Param("days", ParseIntPipe) days: number,
    ): Promise<{ pkgbase: string; count: number }[]> {
        return this.routerService.getPackageStats(days);
    }

    @HttpCode(HttpStatus.OK)
    @Get("/per-day/:days")
    async getRouterStatsPerDay(@Param("days", ParseIntPipe) days: number): Promise<{ day: string; count: number }[]> {
        return this.routerService.getPerDayStats(days);
    }
}
