import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post } from "@nestjs/common";
import { RouterService } from "./router.service";
import type { RouterHitBody } from "../types";
import type { RouterHit, RouterHitColumns } from "./router.entity";
import { RouterHitColumPipe } from "./router.pipe";

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
}
