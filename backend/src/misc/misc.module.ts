import { CacheModule } from "@nestjs/cache-manager";
import { Module } from "@nestjs/common";
import { MiscController } from "./misc.controller";
import { MiscService } from "./misc.service";

@Module({
    controllers: [MiscController],
    exports: [MiscService],
    imports: [CacheModule.register()],
    providers: [MiscService],
})
export class MiscModule {}
