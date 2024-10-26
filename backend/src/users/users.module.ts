import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./users.entity";

@Module({
    exports: [TypeOrmModule],
    imports: [TypeOrmModule.forFeature([User])],
})
export class UsersModule {}
