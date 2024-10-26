import { Body, Controller, HttpCode, HttpStatus, Logger, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import type { LoginCredentials } from "../types";

@Controller("auth")
export class AuthController {
    constructor(private authService: AuthService) {}

    @HttpCode(HttpStatus.OK)
    @Post("login")
    signIn(@Body() creds: LoginCredentials) {
        Logger.log(`User ${creds.username} is attempting to sign in with password ${creds.password}`, "AuthController");
        return this.authService.signIn(creds.username, creds.password);
    }
}
