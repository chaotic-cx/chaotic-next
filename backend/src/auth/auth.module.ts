import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { JwtModule } from "@nestjs/jwt";

@Module({
    imports: [
        UsersModule,
        JwtModule.register({
            global: true,
            secret: process.env.CAUR_JWT_SECRET || "chaotic",
            signOptions: { expiresIn: "60s" },
        }),
    ],
})
export class AuthModule {}
