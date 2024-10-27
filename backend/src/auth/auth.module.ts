import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import authConfig from "../config/auth.config";
import { User } from "../users/users.entity";
import { UsersService } from "../users/users.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtGuard } from "./jwt.auth.guard";
import { JwtStrategy } from "./jwt.strategy";
import { LocalStrategy } from "./local.strategy";

@Module({
    controllers: [AuthController],
    exports: [TypeOrmModule, PassportModule, JwtStrategy],
    imports: [
        ConfigModule.forFeature(authConfig),
        JwtModule.register({
            global: true,
            secret: process.env.CAUR_JWT_SECRET,
            signOptions: { expiresIn: "7d" },
        }),
        PassportModule.register({ defaultStrategy: ["jwt", "local"] }),
        TypeOrmModule.forFeature([User]),
    ],
    providers: [
        AuthService,
        JwtStrategy,
        JwtService,
        LocalStrategy,
        UsersService,
        { provide: APP_GUARD, useClass: JwtGuard },
    ],
})
export class AuthModule {}
