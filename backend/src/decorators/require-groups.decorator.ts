import { SetMetadata } from '@nestjs/common';

export const REQUIRE_GROUPS_KEY = 'requireGroups';
export const REQUIRE_REPO_GROUP_KEY = 'requireRepoGroup';

/** Require membership of at least one of the given GitLab groups. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const RequireGroups = (...groups: string[]) => SetMetadata(REQUIRE_GROUPS_KEY, groups);

/**
 * Require the group matching the repo targeted by the request. The repo name
 * is read from the request body or route params (`repo`), and mapped via
 * `requiredGroupForRepo`. Requests without a known repo are denied.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const RequireRepoGroup = () => SetMetadata(REQUIRE_REPO_GROUP_KEY, true);
