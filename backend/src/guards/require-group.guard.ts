import { Injectable, type CanActivate, type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { requiredGroupForRepo } from '../auth/gitlab-groups';
import { REQUIRE_GROUPS_KEY, REQUIRE_REPO_GROUP_KEY } from '../decorators/require-groups.decorator';

interface RequestWithUser {
  user?: { groups?: string[] | null } | null;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
}

@Injectable()
export class RequireGroupGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredGroups = this.resolveRequiredGroups(context);
    if (requiredGroups.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const groups = request.user?.groups ?? [];
    if (!requiredGroups.some((group) => groups.includes(group))) {
      throw new ForbiddenException(
        `This action requires GitLab group membership in '${requiredGroups.join("' or '")}'.`,
      );
    }
    return true;
  }

  private resolveRequiredGroups(context: ExecutionContext): string[] {
    const staticGroups = this.reflector.getAllAndOverride<string[]>(REQUIRE_GROUPS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (staticGroups !== undefined) {
      return staticGroups;
    }

    const fromRepo = this.reflector.getAllAndOverride<boolean>(REQUIRE_REPO_GROUP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!fromRepo) {
      return [];
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const repoName = request.body?.['repo'] ?? request.params?.['repo'];
    if (typeof repoName !== 'string' || repoName.length === 0) {
      throw new ForbiddenException('No repository specified');
    }
    const group = requiredGroupForRepo(repoName);
    if (group === undefined) {
      throw new ForbiddenException(`Unknown repository '${repoName}'`);
    }
    return [group];
  }
}
