import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { packageLogRouteFromUrl } from '../functions';
import { BuildClassPipe } from '../pipes/build-class.pipe';
import { BuildStatusSectionComponent } from './build-status-section.component';
import { BUILD_ESTIMATE_TOOLTIP, BuildStatusService } from './build-status.service';
import { sortByStartTime } from './queue-estimates';
import { FlipListDirective } from '../animations/flip-list.directive';

@Component({
  selector: 'chaotic-build-status-active-builds',
  imports: [BuildStatusSectionComponent, RouterLink, Tooltip, BuildClassPipe, FlipListDirective],
  templateUrl: './active-builds.component.html',
})
export class ActiveBuildsComponent {
  readonly buildStatusService = inject(BuildStatusService);
  readonly estimateTooltip = BUILD_ESTIMATE_TOOLTIP;
  readonly packageLogRouteFromUrl = packageLogRouteFromUrl;

  readonly sortedQueue = computed(() =>
    sortByStartTime(this.buildStatusService.activeQueue(), this.buildStatusService.activeStartedMs()),
  );
}
