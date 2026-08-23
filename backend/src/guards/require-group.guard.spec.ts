import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { RequireGroupGuard } from './require-group.guard';
import { REQUIRE_GROUPS_KEY, REQUIRE_REPO_GROUP_KEY } from '../decorators/require-groups.decorator';

function createContext({
  userGroups,
  body,
  params,
  query,
  staticGroups,
  useRepoGroup,
}: {
  userGroups?: string[];
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  staticGroups?: string[];
  useRepoGroup?: boolean;
}) {
  const reflector = {
    getAllAndOverride: vi.fn((key: string) => {
      if (key === REQUIRE_GROUPS_KEY) return staticGroups;
      if (key === REQUIRE_REPO_GROUP_KEY) return useRepoGroup ?? false;
      return undefined;
    }),
  } as unknown as Reflector;

  const request = { user: { groups: userGroups ?? [] }, body, params, query };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as never;

  return { guard: new RequireGroupGuard(reflector), context, reflector };
}

describe('RequireGroupGuard', () => {
  it('allows access when no groups are required', async () => {
    const { guard, context } = createContext({ userGroups: [] });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows access when user is in the required static group', async () => {
    const { guard, context } = createContext({
      userGroups: ['chaotic-aur'],
      staticGroups: ['chaotic-aur'],
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('denies access when user is not in the required static group', async () => {
    const { guard, context } = createContext({
      userGroups: ['garuda-linux'],
      staticGroups: ['chaotic-aur'],
    });
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('allows repo-based access when user is in the required group', async () => {
    const { guard, context } = createContext({
      userGroups: ['chaotic-aur'],
      useRepoGroup: true,
      body: { repo: 'chaotic-aur' },
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('denies repo-based access when user is not in the required group', async () => {
    const { guard, context } = createContext({
      userGroups: ['chaotic-aur'],
      useRepoGroup: true,
      body: { repo: 'garuda' },
    });
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('reads repo from query params', async () => {
    const { guard, context } = createContext({
      userGroups: ['garuda-linux'],
      useRepoGroup: true,
      query: { repo: 'garuda' },
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('reads repo from route params', async () => {
    const { guard, context } = createContext({
      userGroups: ['chaotic-aur'],
      useRepoGroup: true,
      params: { repo: 'chaotic-aur' },
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('denies when no repo is specified in repo-based mode', async () => {
    const { guard, context } = createContext({
      userGroups: ['chaotic-aur'],
      useRepoGroup: true,
    });
    await expect(guard.canActivate(context)).rejects.toThrow('No repository specified');
  });

  it('denies when repo is an empty string', async () => {
    const { guard, context } = createContext({
      userGroups: ['chaotic-aur'],
      useRepoGroup: true,
      body: { repo: '' },
    });
    await expect(guard.canActivate(context)).rejects.toThrow('No repository specified');
  });

  it('denies when repo is unknown', async () => {
    const { guard, context } = createContext({
      userGroups: ['chaotic-aur'],
      useRepoGroup: true,
      body: { repo: 'nonexistent' },
    });
    await expect(guard.canActivate(context)).rejects.toThrow('Unknown repository');
  });
});
