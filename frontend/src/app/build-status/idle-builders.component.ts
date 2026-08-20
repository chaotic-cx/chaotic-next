import { Component, inject } from '@angular/core';
import { BuildClassPipe } from '../pipes/build-class.pipe';
import { BuildStatusSectionComponent } from './build-status-section.component';
import { BuildStatusService } from './build-status.service';

@Component({
  selector: 'chaotic-build-status-idle-builders',
  imports: [BuildStatusSectionComponent, BuildClassPipe],
  templateUrl: './idle-builders.component.html',
})
export class IdleBuildersComponent {
  readonly buildStatusService = inject(BuildStatusService);
}
