import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Build, Builder, Package, Repo } from "./builder.entity";

@Module({
    controllers: [],
    exports: [TypeOrmModule],
    imports: [TypeOrmModule.forFeature([Builder, Build, Repo, Package])],
    providers: [],
})
export class BuilderModule {}
