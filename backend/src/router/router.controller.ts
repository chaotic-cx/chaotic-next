import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UnauthorizedException } from "@nestjs/common";
import { RouterService } from "./router.service";
import type { RouterHitBody } from "../types";
import { ConfigService } from "@nestjs/config";
import { RouterHit, RouterHitColumns } from "./router.entity";
import { RouterHitColumPipe } from "./router.pipe";

@Controller("router")
export class RouterController {
    authToken: string;

    constructor(
        private configService: ConfigService,
        private routerService: RouterService,
    ) {
        this.authToken = this.configService.get<string>("CAUR_ROUTER_TOKEN") || "caur";
    }

    @Post("hit")
    async hitRouter(@Body() body: RouterHitBody, @Query("token") token: string): Promise<void> {
        if (token !== this.authToken) {
            throw new UnauthorizedException("Invalid token");
        }
        return this.routerService.hitRouter(body);
    }

    @Get("/:days/:type")
    async getRouterStats(
        @Param("type", RouterHitColumPipe) type: RouterHitColumns,
        @Param("days", ParseIntPipe) days: number,
    ): Promise<RouterHit[]> {
        return this.routerService.getGeneralStats(days, type);
    }
}

