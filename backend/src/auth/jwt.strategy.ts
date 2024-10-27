import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { passportJwtSecret } from "jwks-rsa";
import { Strategy as BaseStrategy, ExtractJwt } from "passport-jwt";
import type { JwtPayload } from "../interfaces/auth";

@Injectable()
export class JwtStrategy extends PassportStrategy(BaseStrategy, "jwt") {
    validAudiences = [];

    constructor(configService: ConfigService) {
        super({
            secretOrKeyProvider: passportJwtSecret({
                cache: true,
                rateLimit: true,
                jwksRequestsPerMinute: 5,
                jwksUri: `https://${configService.get<string>("auth.domain")}/.well-known/jwks.json`,
                handleSigningKeyError: (err) => Logger.error(err),
            }),

            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            issuer: `https://${configService.get<string>("auth.domain")}/`,
            algorithms: ["RS256"],
        });

        this.validAudiences.push(configService.get<string>("auth.audience"));
    }

    async validate(payload: JwtPayload): Promise<JwtPayload> {
        if (!this.validAudiences.some((a) => a === payload.aud)) {
            throw new UnauthorizedException("Invalid audience");
        }
        return {
            sub: payload.sub,
            scope: payload.scope,
        };
    }
}
