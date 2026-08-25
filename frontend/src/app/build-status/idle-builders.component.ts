import { Component, inject } from '@angular/core';
import { BuildClassPipe } from '../pipes/build-class.pipe';
import { BuildStatusSectionComponent } from './build-status-section.component';
import { BuildStatusService } from './build-status.service';
import { FlipListDirective } from '../animations/flip-list.directive';

@Component({
  selector: 'chaotic-build-status-idle-builders',
  imports: [BuildStatusSectionComponent, BuildClassPipe, FlipListDirective],
  templateUrl: './idle-builders.component.html',
})
export class IdleBuildersComponent {
  readonly buildStatusService = inject(BuildStatusService);
}
