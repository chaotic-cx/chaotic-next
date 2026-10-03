import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { FlipListDirective } from '../animations/flip-list.directive';
import { packageLogRouteFromUrl } from '../functions';
import { BuildClassPipe } from '../pipes/build-class.pipe';
import { LoadErrorComponent } from '../load-error/load-error.component';
import { BuildStatusSectionComponent } from './build-status-section.component';
import { BUILD_ESTIMATE_TOOLTIP, BUILD_OVERTIME_TOOLTIP, BuildStatusService } from './build-status.service';

type EtaTone = 'muted' | 'warn' | 'danger';

interface EtaView {
  label: string;
  tone: EtaTone;
  tooltip: string;
}

const UNKNOWN_TIME_LEFT = 'unknown time left';
const SKELETON_ROW_COUNT = 2;
const PERCENT = 100;

const ETA_TONE_CLASSES: Record<EtaTone, string> = {
  muted: 'text-ctp-subtext1',
  warn: 'text-ctp-yellow',
  danger: 'font-semibold text-ctp-red',
};

@Component({
  selector: 'chaotic-build-status-active-builds',
  imports: [LoadErrorComponent, BuildStatusSectionComponent, RouterLink, Tooltip, BuildClassPipe, FlipListDirective],
  templateUrl: './active-builds.component.html',
  styleUrl: './active-builds.component.css',
})
export class ActiveBuildsComponent {
  readonly buildStatusService = inject(BuildStatusService);
  readonly estimateTooltip = BUILD_ESTIMATE_TOOLTIP;
  readonly packageLogRouteFromUrl = packageLogRouteFromUrl;
  readonly etaToneClasses = ETA_TONE_CLASSES;
  readonly skeletonRows = Array.from({ length: SKELETON_ROW_COUNT });

  readonly sortedQueue = computed(() => this.buildStatusService.activeQueue());

  readonly etaViews = computed(() => {
    const views = new Map<string, EtaView>();
    for (const pkg of this.sortedQueue()) {
      const view = this.etaView(pkg.rawName);
      if (view) views.set(pkg.rawName, view);
    }
    return views;
  });

  progressPercent(rawName: string): number | undefined {
    const progress = this.buildStatusService.activeProgress().get(rawName);
    return progress === undefined ? undefined : Math.round(progress * PERCENT);
  }

  /** Indeterminate bars animate on their own; determinate bars scale instead of resizing (no layout work). */
  progressTransform(rawName: string): string | null {
    const percent = this.progressPercent(rawName);
    return percent === undefined ? null : `scaleX(${percent / PERCENT})`;
  }

  private etaView(rawName: string): EtaView | undefined {
    const service = this.buildStatusService;
    const unknown: EtaView = { label: UNKNOWN_TIME_LEFT, tone: 'warn', tooltip: service.activeUnknownTooltip };
    const eta = service.activeEtaLabels().get(rawName);
    const etaTooltip = service.activeEtaTooltips().get(rawName);

    if (service.activeIsUnknown().get(rawName)) return unknown;

    if (service.activeEtaIsFallback().get(rawName)) {
      if (eta === undefined) return unknown;
      return { label: eta, tone: 'warn', tooltip: etaTooltip ?? service.activeEtaFallbackTooltip };
    }

    const overtime = service.activeOvertimeLabels().get(rawName);
    if (overtime !== undefined) {
      const tooltip = service.activeOvertimeTooltips().get(rawName) ?? BUILD_OVERTIME_TOOLTIP;
      return { label: overtime, tone: 'danger', tooltip };
    }

    if (eta === undefined) return undefined;
    return { label: eta, tone: 'muted', tooltip: etaTooltip ?? BUILD_ESTIMATE_TOOLTIP };
  }
}
