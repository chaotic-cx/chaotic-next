import { Component, computed, inject } from '@angular/core';
import type { MissingDependencyReport } from '@chaotic-next/shared-lib';
import { TranslocoDirective } from '@jsverse/transloco';
import { AppService } from '../../../../app.service';
import { LoadErrorComponent } from '../../../../load-error/load-error.component';
import { chartResource } from '../../chart-config';

export function visibleMissingRows(rows: MissingDependencyReport[]): MissingDependencyReport[] {
  return rows.toSorted(
    (left, right) =>
      right.missingDeps.length +
        right.missingMakeDeps.length -
        (left.missingDeps.length + left.missingMakeDeps.length) || left.pkgname.localeCompare(right.pkgname),
  );
}

@Component({
  selector: 'chaotic-chart-missing-dependencies',
  imports: [LoadErrorComponent, TranslocoDirective],
  templateUrl: './chart-missing-dependencies.component.html',
})
export class ChartMissingDependenciesComponent {
  private readonly appService = inject(AppService);

  readonly chart = chartResource<MissingDependencyReport[]>(() =>
    this.appService.getMissingDependenciesResourceRequest(),
  );

  readonly visibleRows = computed(() => visibleMissingRows(this.chart.data()));
}
