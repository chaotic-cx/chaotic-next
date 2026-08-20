import { Component, computed, inject, output, signal } from '@angular/core';
import { BuildStatusPager } from './build-status-pager.component';
import { BuildStatusSectionComponent } from './build-status-section.component';
import { BuildStatusService } from './build-status.service';
import { PipelineListComponent } from './pipeline-list.component';

const PIPELINES_PAGE_SIZE = 20;

@Component({
  selector: 'chaotic-build-status-pipelines',
  imports: [BuildStatusSectionComponent, PipelineListComponent, BuildStatusPager],
  templateUrl: './build-status-pipelines.component.html',
})
export class BuildStatusPipelinesComponent {
  readonly buildStatusService = inject(BuildStatusService);
  readonly openPipeline = output<number>();

  private readonly page = signal(1);

  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.buildStatusService.pipelineWithStatus().length / PIPELINES_PAGE_SIZE)),
  );

  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));

  readonly paginatedPipelines = computed(() => {
    const pipelines = this.buildStatusService.pipelineWithStatus();
    const start = (this.currentPage() - 1) * PIPELINES_PAGE_SIZE;
    return pipelines.slice(start, start + PIPELINES_PAGE_SIZE);
  });

  selectPage(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.pageCount()));
  }
}
