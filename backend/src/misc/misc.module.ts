import { CacheModule } from "@nestjs/cache-manager";
import { Module } from "@nestjs/common";
import { MiscController } from "./misc.controller";
import { MiscService } from "./misc.service";

@Module({
    imports: [CacheModule.register()],
    controllers: [MiscController],
    providers: [MiscService],
})
export class MiscModule {}
