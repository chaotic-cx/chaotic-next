import { Body, Controller, Post, Query, UnauthorizedException } from "@nestjs/common";
import { RouterService } from "./router.service";
import type { RouterHitBody } from "../types";
import { ConfigService } from "@nestjs/config";

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
}
