import { Component, computed, inject } from '@angular/core';
import type { ArchOverlapReport } from '@chaotic-next/shared-lib';
import { AppService } from '../../../../app.service';
import { chartResource } from '../../chart-config';

export function visibleArchOverlapRows(rows: ArchOverlapReport[]): ArchOverlapReport[] {
  return rows.toSorted((a, b) => a.pkgname.localeCompare(b.pkgname));
}

@Component({
  selector: 'chaotic-chart-arch-overlap',
  templateUrl: './chart-arch-overlap.component.html',
  styleUrl: './chart-arch-overlap.component.css',
})
export class ChartArchOverlapComponent {
  private readonly appService = inject(AppService);

  readonly chart = chartResource<ArchOverlapReport[]>(() => this.appService.getArchOverlapResourceRequest());

  readonly visibleRows = computed(() => visibleArchOverlapRows(this.chart.data()));
}
