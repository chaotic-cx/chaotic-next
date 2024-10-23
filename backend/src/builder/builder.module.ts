import { Module } from "@nestjs/common";
import { BuilderService } from "./builder.service";
import { BuilderController } from "./builder.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Build, Builder, Repo } from "./builder.entity";

@Module({
    controllers: [BuilderController],
    exports: [TypeOrmModule],
    imports: [TypeOrmModule.forFeature([Builder, Build, Repo])],
    providers: [BuilderService],
})
export class BuilderModule {}
