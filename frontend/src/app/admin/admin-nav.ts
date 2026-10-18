import { marker } from '@jsverse/transloco-keys-manager/marker';

export interface AdminNavItem {
  path: string;
  labelKey: string;
  descriptionKey: string;
  icon: string;
}

export interface AdminNavGroup {
  labelKey: string | null;
  items: AdminNavItem[];
}

export const ADMIN_DEFAULT_PATH = 'overview';

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    labelKey: null,
    items: [
      {
        path: ADMIN_DEFAULT_PATH,
        labelKey: marker('admin.layout.nav.overview.label'),
        descriptionKey: marker('admin.layout.nav.overview.description'),
        icon: 'pi pi-gauge',
      },
    ],
  },
  {
    labelKey: marker('admin.layout.groups.packages'),
    items: [
      {
        path: 'packages',
        labelKey: marker('admin.layout.nav.packages.label'),
        descriptionKey: marker('admin.layout.nav.packages.description'),
        icon: 'pi pi-box',
      },
      {
        path: 'arch',
        labelKey: marker('admin.layout.nav.arch.label'),
        descriptionKey: marker('admin.layout.nav.arch.description'),
        icon: 'pi pi-server',
      },
      {
        path: 'package-elf-analysis',
        labelKey: marker('admin.layout.nav.packageElfAnalysis.label'),
        descriptionKey: marker('admin.layout.nav.packageElfAnalysis.description'),
        icon: 'pi pi-microchip',
      },
      {
        path: 'package-bumps',
        labelKey: marker('admin.layout.nav.packageBumps.label'),
        descriptionKey: marker('admin.layout.nav.packageBumps.description'),
        icon: 'pi pi-replay',
      },
    ],
  },
  {
    labelKey: marker('admin.layout.groups.infrastructure'),
    items: [
      {
        path: 'repos',
        labelKey: marker('admin.layout.nav.repos.label'),
        descriptionKey: marker('admin.layout.nav.repos.description'),
        icon: 'pi pi-database',
      },
      {
        path: 'builders',
        labelKey: marker('admin.layout.nav.builders.label'),
        descriptionKey: marker('admin.layout.nav.builders.description'),
        icon: 'pi pi-desktop',
      },
      {
        path: 'repo-operations',
        labelKey: marker('admin.layout.nav.repoOperations.label'),
        descriptionKey: marker('admin.layout.nav.repoOperations.description'),
        icon: 'pi pi-wrench',
      },
    ],
  },
  {
    labelKey: marker('admin.layout.groups.activity'),
    items: [
      {
        path: 'mr-actions',
        labelKey: marker('admin.layout.nav.mrActions.label'),
        descriptionKey: marker('admin.layout.nav.mrActions.description'),
        icon: 'pi pi-check-square',
      },
      {
        path: 'pipeline-triggers',
        labelKey: marker('admin.layout.nav.pipelineTriggers.label'),
        descriptionKey: marker('admin.layout.nav.pipelineTriggers.description'),
        icon: 'pi pi-play-circle',
      },
      {
        path: 'manager-logs',
        labelKey: marker('admin.layout.nav.managerLogs.label'),
        descriptionKey: marker('admin.layout.nav.managerLogs.description'),
        icon: 'pi pi-align-left',
      },
    ],
  },
];

const ADMIN_NAV_ITEMS = ADMIN_NAV.flatMap((group) => group.items);

export function findAdminNavItem(path: string | undefined): AdminNavItem {
  return ADMIN_NAV_ITEMS.find((item) => item.path === path) ?? ADMIN_NAV_ITEMS[0];
}
