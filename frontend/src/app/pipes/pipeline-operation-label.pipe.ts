import { PipelineOperation } from '@chaotic-next/shared-lib';
import { Pipe, PipeTransform } from '@angular/core';

const OPERATION_LABELS: Record<PipelineOperation, string> = {
  [PipelineOperation.NONE]: 'None',
  [PipelineOperation.BUMP_PACKAGES]: 'Bump Packages',
  [PipelineOperation.SCHEDULE_PACKAGES]: 'Schedule Packages',
  [PipelineOperation.RUN_SCHEDULE]: 'Run Schedule',
  [PipelineOperation.DROP_PACKAGES]: 'Drop Packages',
  [PipelineOperation.ADD_PACKAGES]: 'Add Packages',
};

@Pipe({
  name: 'pipelineOperationLabel',
})
export class PipelineOperationLabelPipe implements PipeTransform {
  transform(value: PipelineOperation | string | null | undefined): string {
    if (!value) return '';
    if (Object.values(PipelineOperation).includes(value as PipelineOperation)) {
      return OPERATION_LABELS[value as PipelineOperation];
    }
    return String(value);
  }
}
