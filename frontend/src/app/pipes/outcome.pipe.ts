import { BuildStatus } from '@./shared-lib';
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'outcome',
})
export class OutcomePipe implements PipeTransform {
  transform(value: BuildStatus): string {
    switch (value) {
      case BuildStatus.SUCCESS:
        return 'success';
      case BuildStatus.FAILED:
        return 'failure';
      case BuildStatus.ALREADY_BUILT:
        return 'already-built';
      case BuildStatus.SKIPPED:
        return 'skipped';
      case BuildStatus.CANCELED:
        return 'canceled';
      case BuildStatus.CANCELED_REQUEUE:
        return 'canceled-requeue';
      case BuildStatus.SOFTWARE_FAILURE:
        return 'software-failure';
      case BuildStatus.TIMED_OUT:
        return 'timeout';
      default:
        return 'unknown';
    }
  }
}
