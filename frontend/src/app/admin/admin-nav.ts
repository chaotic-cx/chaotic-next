export interface AdminNavItem {
  path: string;
  label: string;
  description: string;
  icon: string;
}

export interface AdminNavGroup {
  label: string | null;
  items: AdminNavItem[];
}

export const ADMIN_DEFAULT_PATH = 'overview';

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: null,
    items: [
      {
        path: ADMIN_DEFAULT_PATH,
        label: 'Overview',
        description: 'Failing builds, broken packages and recent maintainer activity.',
        icon: 'pi pi-gauge',
      },
    ],
  },
  {
    label: 'Packages',
    items: [
      {
        path: 'packages',
        label: 'Chaotic packages',
        description: 'Add, edit and rebuild packages of the Chaotic-AUR repositories.',
        icon: 'pi pi-box',
      },
      {
        path: 'arch',
        label: 'Arch packages',
        description: 'Reference data of the Arch Linux packages that trigger rebuilds.',
        icon: 'pi pi-server',
      },
      {
        path: 'package-elf-analysis',
        label: 'ELF analysis',
        description: 'Sonames and symbols that the signal scanner indexed per package.',
        icon: 'pi pi-microchip',
      },
      {
        path: 'package-bumps',
        label: 'Package bumps',
        description: 'Rebuilds that the repo manager triggered and their causes.',
        icon: 'pi pi-replay',
      },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      {
        path: 'repos',
        label: 'Repositories',
        description: 'Repository sources, git refs and GitLab connections.',
        icon: 'pi pi-database',
      },
      {
        path: 'builders',
        label: 'Builders',
        description: 'Build machines and their build classes.',
        icon: 'pi pi-desktop',
      },
      {
        path: 'repo-operations',
        label: 'Repo operations',
        description: 'Repo manager runs, rescans and the broken package report.',
        icon: 'pi pi-wrench',
      },
    ],
  },
  {
    label: 'Activity',
    items: [
      {
        path: 'mr-actions',
        label: 'MR actions',
        description: 'Merge request reviews that maintainers performed.',
        icon: 'pi pi-check-square',
      },
      {
        path: 'pipeline-triggers',
        label: 'Pipeline triggers',
        description: 'GitLab pipelines that maintainers started from this site.',
        icon: 'pi pi-play-circle',
      },
      {
        path: 'manager-logs',
        label: 'Manager logs',
        description: 'Internal logs of the Chaotic manager instance.',
        icon: 'pi pi-align-left',
      },
    ],
  },
];

const ADMIN_NAV_ITEMS = ADMIN_NAV.flatMap((group) => group.items);

export function findAdminNavItem(path: string | undefined): AdminNavItem {
  return ADMIN_NAV_ITEMS.find((item) => item.path === path) ?? ADMIN_NAV_ITEMS[0];
}
