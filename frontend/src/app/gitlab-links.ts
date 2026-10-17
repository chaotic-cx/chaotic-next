export const PKGBUILDS_GITLAB_URL = 'https://gitlab.com/chaotic-aur/pkgbuilds';

export function mergeRequestUrl(iid: number): string {
  return `${PKGBUILDS_GITLAB_URL}/-/merge_requests/${iid}`;
}

export function commitUrl(sha: string): string {
  return `${PKGBUILDS_GITLAB_URL}/-/commit/${sha}`;
}
