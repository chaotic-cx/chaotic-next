import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { UsersService } from "../users/users.service";
import type { User } from "../users/users.entity";
import * as bcrypt from "bcrypt";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class AuthService {
    constructor(
        private jwtService: JwtService,
        private usersService: UsersService,
    ) {}

    async signIn(username: string, password: string): Promise<{ access_token: string }> {
        const user: User = await this.usersService.checkIfUserExists(username, "username");

        if (!user) throw new UnauthorizedException("User doesn't exist");

        if (user?.password) {
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) throw new UnauthorizedException("Invalid credentials");
        }

        Logger.log(`User ${username} signed in successfully`, "AuthService");

        const payload = { sub: user.id, username: user.name };
        return {
            access_token: await this.jwtService.signAsync(payload),
        };
    }
}
