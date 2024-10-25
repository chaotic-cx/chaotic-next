import { Module } from "@nestjs/common";
import { MiscService } from "./misc.service";

@Module({
    controllers: [],
    providers: [MiscService],
})
export class MiscModule {}
