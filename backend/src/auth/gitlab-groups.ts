export const GITLAB_GROUP_CHAOTIC_AUR = 'chaotic-aur';
export const GITLAB_GROUP_GARUDA_LINUX = 'garuda-linux';

export const GITLAB_LOGIN_GROUPS = [GITLAB_GROUP_CHAOTIC_AUR, GITLAB_GROUP_GARUDA_LINUX] as const;

const REPO_REQUIRED_GROUP: Record<string, string> = {
  [GITLAB_GROUP_CHAOTIC_AUR]: GITLAB_GROUP_CHAOTIC_AUR,
  garuda: GITLAB_GROUP_GARUDA_LINUX,
};

export function requiredGroupForRepo(repoName: string): string | undefined {
  return REPO_REQUIRED_GROUP[repoName];
}

export function userGroupsOf(user: { groups?: string[] | null } | null | undefined): string[] {
  return user?.groups ?? [];
}
