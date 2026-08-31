import { BuildStatus } from '@chaotic-next/shared-lib';

export const BUILD_STATUS_ICONS: Record<BuildStatus, string> = {
  [BuildStatus.SUCCESS]: 'pi-check-circle text-ctp-green',
  [BuildStatus.ALREADY_BUILT]: 'pi-check text-ctp-sapphire',
  [BuildStatus.SKIPPED]: 'pi-angle-double-right text-ctp-text',
  [BuildStatus.FAILED]: 'pi-exclamation-circle text-ctp-red',
  [BuildStatus.TIMED_OUT]: 'pi-hourglass text-ctp-maroon',
  [BuildStatus.CANCELED]: 'pi-ban text-ctp-peach',
  [BuildStatus.CANCELED_REQUEUE]: 'pi-replay text-ctp-yellow',
  [BuildStatus.SOFTWARE_FAILURE]: 'pi-exclamation-triangle text-ctp-blue',
};

export function statusIconClass(status: BuildStatus): string {
  return BUILD_STATUS_ICONS[status] ?? '';
}
