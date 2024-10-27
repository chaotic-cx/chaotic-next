import { type ExecutionContext, Optional } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard, type AuthModuleOptions } from "@nestjs/passport";
import type { Observable } from "rxjs";
import { ALLOW_ANONYMOUS_META_KEY } from "./anonymous.decorator";

export class JwtGuard extends AuthGuard("jwt") {
    constructor(
        @Optional() protected readonly options: AuthModuleOptions,
        private readonly reflector: Reflector,
    ) {
        super(options);
    }

    /**
     * Check if the route is allowed to be accessed by anonymous users, and if so, allow access.
     * Falls back to the default JWT guard behavior if the route is not marked as anonymous.
     * @param context
     */
    canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
        const isAnonymousAllowed =
            this.reflector.get<boolean>(ALLOW_ANONYMOUS_META_KEY, context.getHandler()) ||
            this.reflector.get<boolean>(ALLOW_ANONYMOUS_META_KEY, context.getClass());

        if (isAnonymousAllowed) return true;

        return super.canActivate(context);
    }
}
