import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-local";
import { AuthService } from "./auth.service";

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
    constructor(private authService: AuthService) {
        super();
    }

    /**
     * Validate the user by checking the username and password.
     * @param username The user's username
     * @param password The user's password
     * @returns Object containing access_token
     */
    async validate(username: string, password: string): Promise<{ access_token: string }> {
        const user: { access_token: string } = await this.authService.signIn(username, password);
        if (!user) {
            throw new UnauthorizedException("Invalid credentials");
        }
        return user;
    }
}
