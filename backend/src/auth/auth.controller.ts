import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Post, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import type { LoginCredentials } from "../types";
import { LocalAuthGuard } from "./local.auth.guard";

@Controller("auth")
export class AuthController {
    constructor(private authService: AuthService) {}

    @HttpCode(HttpStatus.OK)
    @Post("login")
    @UseGuards(LocalAuthGuard)
    signIn(@Body() cred: LoginCredentials) {
        Logger.log(`User ${cred.username} is attempting to sign in with password ${cred.password}`, "AuthController");
        return this.authService.signIn(cred.username, cred.password);
    }

    @HttpCode(HttpStatus.OK)
    @Get("auth0/login")
    auth0Login() {
        Logger.log("User is attempting to sign in with Auth0", "AuthController");
    }

    @HttpCode(HttpStatus.OK)
    @Get("auth0/callback")
    auth0Callback(req: any) {
        Logger.debug("Auth0 callback initiated", "AuthController");
        req.session.user_id = req.user.id;
        Logger.debug(`User ${req.user.username} has signed in with Auth0`, "AuthController");
        Logger.debug(req, "AuthController");
    }
}
