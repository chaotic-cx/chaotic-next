import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import type { User } from "../users/users.entity";
import { UsersService } from "../users/users.service";

@Injectable()
export class AuthService {
    constructor(
        private jwtService: JwtService,
        private usersService: UsersService,
    ) {}

    /**
     * Sign in a user, a source of truth is the database.
     * Will throw an error if the user doesn't exist or the password is incorrect.
     * @param username User's username
     * @param password User's password
     * @returns Object containing access_token
     */
    async signIn(username: string, password: string): Promise<{ access_token: string }> {
        const user: User = await this.usersService.checkIfUserExists(username, "username");

        if (!user) throw new UnauthorizedException("User doesn't exist");

        if (user?.password) {
            const isMatch: boolean = await bcrypt.compare(password, user.password);
            if (!isMatch) throw new UnauthorizedException("Invalid credentials");
        }

        Logger.log(`User ${username} signed in successfully`, "AuthService");

        const payload = { sub: user.id, username: user.name };
        return {
            access_token: await this.jwtService.signAsync(payload),
        };
    }
}
