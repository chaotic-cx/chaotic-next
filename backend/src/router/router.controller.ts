import { Body, Controller, Logger, Post, Query } from "@nestjs/common";
import { RouterService } from "./router.service";
import type { RouterHitBody } from "../types";

@Controller("router")
export class RouterController {
    authToken = process.env.CAUR_ROUTER_TOKEN || "caur";

    constructor(private routerService: RouterService) {}

    @Post("hit")
    async hitRouter(@Body() body: RouterHitBody, @Query("token") token: string) {
        if (token !== this.authToken) {
            Logger.debug(`Invalid token: ${token} instead of ${this.authToken}`, "RouterController");
            return "Invalid token";
        }

        return this.routerService.hitRouter(body);
    }
}
