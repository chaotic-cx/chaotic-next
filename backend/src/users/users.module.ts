import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./users.entity";
import { UsersService } from "./users.service";

@Module({
    exports: [TypeOrmModule],
    imports: [TypeOrmModule.forFeature([User])],
    providers: [UsersService],
})
export class UsersModule {}
