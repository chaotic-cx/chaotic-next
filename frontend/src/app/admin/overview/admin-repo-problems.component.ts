import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { CHAOTIC_AUR_REPO } from '@chaotic-next/shared-lib';
import type {
  ArchOverlapReport,
  BrokenPackageReport,
  MissingDependencyReport,
  Paginated,
  RebuildCoverageReport,
} from '@chaotic-next/shared-lib';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { APP_CONFIG } from '../../../environments/app-config.token';
import { AppService } from '../../app.service';
import { resourceFailed, resourceValue } from '../../functions';
import { injectActiveTranslation } from '../../i18n/active-translation';
import { formatRelativeTime, injectRelativeTimeLabels } from '../../pipes/relative-time.pipe';
import { AdminProblemSectionComponent, type ProblemRow } from './admin-problem-section.component';

const PREVIEW_SIZE = 3;
const INSIGHTS_PAGE = '/stats/insights';
const REPO_OPERATIONS_PAGE = '../repo-operations';

@Component({
  selector: 'chaotic-admin-repo-problems',
  imports: [AdminProblemSectionComponent, TranslocoDirective],
  template: `
    <section
      class="chaotic-card"
      *transloco="let t; prefix: 'admin.overview.repoProblems'"
      aria-labelledby="overview-problems-title"
    >
      <header class="chaotic-card__header">
        <h2 class="chaotic-card__title" id="overview-problems-title">{{ t('title') }}</h2>
      </header>
      <chaotic-admin-problem-section
        [count]="brokenCount()"
        [rows]="brokenRows()"
        [failed]="brokenFailed()"
        [link]="repoOperationsPage"
        [title]="t('broken.title')"
        [emptyText]="t('broken.empty')"
        [linkLabel]="t('broken.link')"
        (retry)="brokenResource.reload()"
      />
      <chaotic-admin-problem-section
        [count]="missingCount()"
        [rows]="missingRows()"
        [failed]="missingFailed()"
        [link]="insightsPage"
        [title]="t('missing.title')"
        [emptyText]="t('missing.empty')"
        (retry)="missingResource.reload()"
      />
      <chaotic-admin-problem-section
        [count]="uncoveredCount()"
        [rows]="uncoveredRows()"
        [failed]="coverageFailed()"
        [title]="t('uncovered.title')"
        [emptyText]="t('uncovered.empty')"
        (retry)="coverageResource.reload()"
      />
      <chaotic-admin-problem-section
        [count]="overlapCount()"
        [rows]="overlapRows()"
        [failed]="overlapFailed()"
        [link]="insightsPage"
        [title]="t('overlap.title')"
        [emptyText]="t('overlap.empty')"
        (retry)="overlapResource.reload()"
      />
    </section>
  `,
})
export class AdminRepoProblemsComponent {
  private readonly appService = inject(AppService);
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;
  private readonly transloco = inject(TranslocoService);
  private readonly activeTranslation = injectActiveTranslation();
  private readonly relativeTimeLabels = injectRelativeTimeLabels();

  protected readonly insightsPage = INSIGHTS_PAGE;
  protected readonly repoOperationsPage = REPO_OPERATIONS_PAGE;

  protected readonly brokenResource = httpResource<Paginated<BrokenPackageReport>>(() => ({
    url: `${this.backendUrl}/repo/broken`,
    params: { page: 1, perPage: PREVIEW_SIZE },
  }));
  protected readonly missingResource = httpResource<MissingDependencyReport[]>(() =>
    this.appService.getMissingDependenciesResourceRequest(),
  );
  protected readonly coverageResource = httpResource<RebuildCoverageReport>(() => ({
    url: `${this.backendUrl}/repo/rebuild-coverage`,
  }));
  protected readonly overlapResource = httpResource<ArchOverlapReport[]>(() =>
    this.appService.getArchOverlapResourceRequest(),
  );

  protected readonly brokenFailed = resourceFailed(this.brokenResource);
  protected readonly missingFailed = resourceFailed(this.missingResource);
  protected readonly coverageFailed = resourceFailed(this.coverageResource);
  protected readonly overlapFailed = resourceFailed(this.overlapResource);

  protected readonly brokenCount = computed(() => resourceValue(this.brokenResource)?.total ?? null);
  protected readonly brokenRows = computed<ProblemRow[]>(() =>
    (resourceValue(this.brokenResource)?.items ?? []).map((report) => ({
      name: report.pkgname,
      detail: report.reasons[0] ?? '',
    })),
  );

  private readonly missingReports = computed(() => resourceValue(this.missingResource));
  protected readonly missingCount = computed(() => this.missingReports()?.length ?? null);
  protected readonly missingRows = computed<ProblemRow[]>(() =>
    (this.missingReports() ?? []).slice(0, PREVIEW_SIZE).map((report) => ({
      name: report.pkgname,
      detail: [...report.missingDeps, ...report.missingMakeDeps].join(', '),
    })),
  );

  private readonly uncoveredBreaks = computed(() => resourceValue(this.coverageResource)?.uncoveredBreaks);
  protected readonly uncoveredCount = computed(() => this.uncoveredBreaks()?.length ?? null);
  protected readonly uncoveredRows = computed<ProblemRow[]>(() => {
    this.activeTranslation();

    return (this.uncoveredBreaks() ?? []).slice(0, PREVIEW_SIZE).map((entry) => ({
      name: entry.pkgname,
      detail: this.transloco.translate('admin.overview.repoProblems.uncovered.detail', {
        since: formatRelativeTime(entry.brokenSince, this.relativeTimeLabels()),
      }),
    }));
  });

  private readonly overlapReports = computed(() =>
    resourceValue(this.overlapResource)?.filter((report) => report.repoName === CHAOTIC_AUR_REPO),
  );
  protected readonly overlapCount = computed(() => this.overlapReports()?.length ?? null);
  protected readonly overlapRows = computed<ProblemRow[]>(() =>
    (this.overlapReports() ?? []).slice(0, PREVIEW_SIZE).map((report) => ({
      name: report.pkgname,
      detail: report.archVersion ? `Arch ${report.archVersion}` : '',
    })),
  );
}
