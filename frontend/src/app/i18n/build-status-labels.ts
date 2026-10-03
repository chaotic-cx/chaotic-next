import { BuildStatus } from '@chaotic-next/shared-lib';
import { marker } from '@jsverse/transloco-keys-manager/marker';

export const BUILD_STATUS_LABEL_KEYS: Record<BuildStatus, string> = {
  [BuildStatus.SUCCESS]: marker('buildStatusNames.success'),
  [BuildStatus.ALREADY_BUILT]: marker('buildStatusNames.alreadyBuilt'),
  [BuildStatus.SKIPPED]: marker('buildStatusNames.skipped'),
  [BuildStatus.FAILED]: marker('buildStatusNames.failed'),
  [BuildStatus.TIMED_OUT]: marker('buildStatusNames.timedOut'),
  [BuildStatus.CANCELED]: marker('buildStatusNames.canceled'),
  [BuildStatus.CANCELED_REQUEUE]: marker('buildStatusNames.canceledRequeue'),
  [BuildStatus.SOFTWARE_FAILURE]: marker('buildStatusNames.softwareFailure'),
};
