import { Body, Controller, Post, Query, UnauthorizedException } from "@nestjs/common";
import { RouterService } from "./router.service";
import type { RouterHitBody } from "../types";

@Controller("router")
export class RouterController {
    authToken = process.env.CAUR_ROUTER_TOKEN || "caur";

    constructor(private routerService: RouterService) {}

    @Post("hit")
    async hitRouter(@Body() body: RouterHitBody, @Query("token") token: string): Promise<void> {
        if (token !== this.authToken) {
            throw new UnauthorizedException("Invalid token");
        }
        return this.routerService.hitRouter(body);
    }
}
