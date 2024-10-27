import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post } from "@nestjs/common";
import type { RouterHitBody } from "../types";
import type { RouterHit, RouterHitColumns } from "./router.entity";
import { RouterHitColumPipe } from "./router.pipe";
import { RouterService } from "./router.service";
import { AllowAnonymous } from "../auth/anonymous.decorator";

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
    async getRouterStatsDefault(@Param("days", ParseIntPipe) days: number): Promise<RouterHit[]> {
        return this.routerService.getCountryStats(days);
    }

    @HttpCode(HttpStatus.OK)
    @Get("/mirror/:days")
    async getRouterStatsMirror(@Param("days", ParseIntPipe) days: number): Promise<RouterHit[]> {
        return this.routerService.getMirrorStats(days);
    }

    @HttpCode(HttpStatus.OK)
    @Get("/package/:days")
    async getRouterStatsPackage(@Param("days", ParseIntPipe) days: number): Promise<RouterHit[]> {
        return this.routerService.getPackageStats(days);
    }
}
