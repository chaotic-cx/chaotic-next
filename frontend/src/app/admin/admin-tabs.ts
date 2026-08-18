export const ADMIN_TABS = [
  'packages',
  'arch',
  'repos',
  'builders',
  'mr-actions',
  'pipeline-triggers',
  'package-bumps',
  'package-elf-analysis',
  'aur-scan',
  'repo-operations',
] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

export function isAdminTab(value: string): value is AdminTab {
  return (ADMIN_TABS as readonly string[]).includes(value);
}
