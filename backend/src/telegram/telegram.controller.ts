import { CacheInterceptor } from "@nestjs/cache-manager";
import { Controller, Get, Param, ParseIntPipe, Query, UseInterceptors } from "@nestjs/common";
import { TelegramService } from "./telegram.service";
import { RepositoryList, TgMessageList } from "@./shared-lib";

@Controller("telegram")
@UseInterceptors(CacheInterceptor)
export class TelegramController {
    constructor(private telegramService: TelegramService) {}

    @Get("news")
    getNews(): Promise<TgMessageList> {
        return this.telegramService.getNews();
    }

    @Get("deployments/all/:amount")
    getTelegram(
        @Param("amount", ParseIntPipe) amount: number,
        @Query("repo") repo: RepositoryList,
    ): Promise<TgMessageList> {
        return this.telegramService.getDeployments(amount, repo);
    }

    @Get("deployments/succeeded/:amount")
    getSucceeded(
        @Param("amount", ParseIntPipe) amount: number,
        @Query("repo") repo: RepositoryList,
    ): Promise<TgMessageList> {
        return this.telegramService.getSucceeded(amount, repo);
    }

    @Get("deployments/failed/:amount")
    getFailed(
        @Param("amount", ParseIntPipe) amount: number,
        @Query("repo") repo: RepositoryList,
    ): Promise<TgMessageList> {
        return this.telegramService.getFailed(amount, repo);
    }

    @Get("deployments/timeout/:amount")
    getTimedOut(
        @Param("amount", ParseIntPipe) amount: number,
        @Query("repo") repo: RepositoryList,
    ): Promise<TgMessageList> {
        return this.telegramService.getTimedOut(amount, repo);
    }

    @Get("deployments/cleanup/:amount")
    getCleanupJobs(
        @Param("amount", ParseIntPipe) amount: number,
        @Query("repo") repo: RepositoryList,
    ): Promise<TgMessageList> {
        return this.telegramService.getCleanupJobs(amount, repo);
    }

    @Get("deauth")
    deAuth(): Promise<void> {
        return this.telegramService.deAuth();
    }

    @Get("auth")
    auth(): void {
        this.telegramService.doAuth();
    }
}
