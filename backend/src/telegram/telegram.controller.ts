import { CacheInterceptor } from "@nestjs/cache-manager"
import {
    Controller,
    Get,
    Param,
    ParseIntPipe,
    UseInterceptors,
} from "@nestjs/common"
import { TelegramService } from "./telegram.service"

@Controller("telegram")
@UseInterceptors(CacheInterceptor)
export class TelegramController {
    constructor(private telegramService: TelegramService) {}

    @Get("news")
    getNews(): any {
        return this.telegramService.getNews()
    }

    @Get("deployments/all/:amount")
    getTelegram(@Param("amount", ParseIntPipe) amount: number): any {
        return this.telegramService.getDeployments(amount)
    }

    @Get("deployments/succeeded/:amount")
    getSucceeded(@Param("amount", ParseIntPipe) amount: number): any {
        return this.telegramService.getSucceeded(amount)
    }

    @Get("deployments/failed/:amount")
    getFailed(@Param("amount", ParseIntPipe) amount: number): any {
        return this.telegramService.getFailed(amount)
    }

    @Get("deployments/timeout/:amount")
    getTimedOut(@Param("amount", ParseIntPipe) amount: number): any {
        return this.telegramService.getTimedOut(amount)
    }

    @Get("deployments/cleanup/:amount")
    getCleanupJobs(@Param("amount", ParseIntPipe) amount: number): any {
        return this.telegramService.getCleanupJobs(amount)
    }

    @Get("deauth")
    deAuth(): any {
        return this.telegramService.deAuth()
    }

    @Get("auth")
    auth(): any {
        return this.telegramService.doAuth()
    }
}
