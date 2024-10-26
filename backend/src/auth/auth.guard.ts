import { CanActivate, type ExecutionContext, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import type { FastifyRequest } from "fastify";

@Injectable()
export class AuthGuard implements CanActivate {
    jwtSecret: string;

    constructor(
        private configService: ConfigService,
        private jwtService: JwtService,
    ) {
        this.jwtSecret = this.configService.get<string>("CAUR_JWT_SECRET");
    }

    /**
     * Checks if the request is authorized.
     * @param context The execution context.
     * @returns True if the request is authorized, throws an exception otherwise.
     */
    async canActivate(context: ExecutionContext): Promise<boolean> {
        Logger.debug("Checking if request is authorized", "AuthGuard");

        const request = context.switchToHttp().getRequest();
        const token = this.extractTokenFromHeader(request);
        if (!token) {
            throw new UnauthorizedException();
        }
        try {
            Logger.debug("Verifying token", "AuthGuard");
            request.user = await this.jwtService.verifyAsync(token, {
                secret: this.jwtSecret,
            });
        } catch {
            throw new UnauthorizedException();
        }
        return true;
    }

    /**
     * Extracts the token from the Authorization header.
     * @param request The request object.
     * @returns The token or undefined.
     * @private
     */
    private extractTokenFromHeader(request: FastifyRequest): string | undefined {
        const [type, token] = request.headers.authorization?.split(" ") ?? [];
        return type === "Bearer" ? token : undefined;
    }
}
