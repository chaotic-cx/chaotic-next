import { BreakpointObserver } from '@angular/cdk/layout';
import {
  PIPELINE_PKG_BASE_REGEX,
  PIPELINE_OPERATIONS,
  PIPELINE_REQUEST_REASONS,
  type PipelineOperation,
  type PipelineRequestReason,
  type PipelineTriggerInputs,
} from '@chaotic-next/shared-lib';
import { Component, computed, effect, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { applyEach, FormField, form, pattern, required, submit } from '@angular/forms/signals';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AutoComplete, AutoCompleteCompleteEvent } from '@openng/optimus-ui/autocomplete';
import { Button } from '@openng/optimus-ui/button';
import { InputText } from '@openng/optimus-ui/inputtext';
import { Select } from '@openng/optimus-ui/select';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { Subject, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { AppService } from '../app.service';
import { AurScanResultComponent } from '../aur-scan/aur-scan-result.component';
import { isScanSettled, AurScanService } from '../aur-scan/aur-scan.service';
import { TitleComponent } from '../title/title.component';
import { PipelineTriggerService } from './pipeline-trigger.service';

const OPERATIONS_REQUIRING_PACKAGES: PipelineOperation[] = ['Bump Packages', 'Schedule Packages', 'Drop Packages'];
const LOOKUP_DEBOUNCE_MS = 300;
const MIN_LOOKUP_LENGTH = 2;
const MOBILE_QUERY = '(max-width: 768px)';

const AUR_SOURCE = 'aur';
const DEFAULT_BUILDER = '';

const REQUEST_REASON_DESCRIPTIONS: Record<PipelineRequestReason, string> = {
  'unset': 'No specific reason.',
  'request': 'Requested by a user.',
  'depends': 'Required as a dependency.',
  'depends:optional': 'Optional dependency.',
  'depends:make': 'Make dependency.',
  'depends:check': 'Check dependency.',
};

interface PackageRow {
  pkgbase: string;
  builder: string;
}

interface AddPackageRow {
  pkgbase: string;
}

interface PipelineTriggerFormModel {
  operation: PipelineOperation;
  packageRows: PackageRow[];
  schedule: string;
  addRows: AddPackageRow[];
  requestOrigin: string;
  requestReason: string;
  customRequestReason: string;
}

function emptyModel(): PipelineTriggerFormModel {
  return {
    operation: 'None',
    packageRows: [],
    schedule: '',
    addRows: [],
    requestOrigin: '',
    requestReason: 'unset',
    customRequestReason: '',
  };
}

@Component({
  selector: 'chaotic-pipeline-trigger',
  imports: [
    AutoComplete,
    AurScanResultComponent,
    Button,
    FormField,
    FormsModule,
    InputText,
    Select,
    RouterLink,
    TitleComponent,
    Tooltip,
  ],
  templateUrl: './pipeline-trigger.component.html',
  styleUrl: './pipeline-trigger.component.css',
})
export class PipelineTriggerComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly observer = inject(BreakpointObserver);
  protected readonly pipelineTriggerService = inject(PipelineTriggerService);
  protected readonly aurScanService = inject(AurScanService);

  private readonly detailsSection = viewChild.required<ElementRef<HTMLElement>>('detailsSection');
  private readonly isMobile = signal(false);

  protected readonly operationCards: Array<{ operation: PipelineOperation; description: string; icon: string }> = [
    {
      operation: 'Bump Packages',
      description: 'Rebuild the selected packages now.',
      icon: 'pi pi-arrow-up',
    },
    {
      operation: 'Schedule Packages',
      description: 'Queue the selected packages for building.',
      icon: 'pi pi-calendar-plus',
    },
    { operation: 'Run Schedule', description: 'Trigger one of the pipeline schedules.', icon: 'pi pi-play' },
    {
      operation: 'Drop Packages',
      description: 'Remove the selected packages from the repository.',
      icon: 'pi pi-trash',
    },
    {
      operation: 'Add Packages',
      description: 'Add new packages from the AUR to the repository.',
      icon: 'pi pi-plus-circle',
    },
  ];
  protected readonly requestReasonCards = PIPELINE_REQUEST_REASONS.map((reason) => ({
    reason,
    description: REQUEST_REASON_DESCRIPTIONS[reason],
  }));

  protected readonly model = signal<PipelineTriggerFormModel>(emptyModel());
  protected readonly triggerForm = form(this.model, (s) => {
    required(s.schedule, {
      when: ({ valueOf }) => valueOf(s.operation) === 'Run Schedule',
      message: 'The schedule to run is required',
    });
    required(s.requestOrigin, {
      when: ({ valueOf }) => valueOf(s.operation) === 'Add Packages',
      message: 'The request origin is required',
    });
    applyEach(s.packageRows, (row) => {
      required(row.pkgbase, { message: 'A package name is required' });
      pattern(row.pkgbase, PIPELINE_PKG_BASE_REGEX, { message: 'Invalid package name format' });
    });
    applyEach(s.addRows, (row) => {
      required(row.pkgbase, { message: 'A package name is required' });
      pattern(row.pkgbase, PIPELINE_PKG_BASE_REGEX, { message: 'Invalid package name format' });
    });
  });

  protected readonly showPackages = computed(() => OPERATIONS_REQUIRING_PACKAGES.includes(this.model().operation));
  protected readonly showSchedule = computed(() => this.model().operation === 'Run Schedule');
  protected readonly showAddPackages = computed(() => this.model().operation === 'Add Packages');
  protected readonly showBuilderSelect = computed(
    () => this.model().operation !== 'Drop Packages' && this.model().operation !== 'Bump Packages',
  );

  protected readonly packageNames = computed(() =>
    this.model()
      .addRows.map((row) => row.pkgbase.trim())
      .filter((name) => name !== ''),
  );

  protected readonly scansComplete = computed(() => {
    const names = this.packageNames();
    if (names.length === 0) return false;
    return names.every((name) => isScanSettled(this.aurScanService.scanOf(name)));
  });

  protected readonly inputsValid = computed(() => {
    // "None" is only the initial state; an operation must be picked.
    if (this.model().operation === 'None') return false;
    if (!this.triggerForm().valid()) return false;
    const model = this.model();
    if (OPERATIONS_REQUIRING_PACKAGES.includes(model.operation)) return model.packageRows.length > 0;
    if (model.operation === 'Add Packages') {
      const addable = (name: string): boolean => !this.aurMissing().has(name) && !this.existingPackages().has(name);
      return model.addRows.length > 0 && model.addRows.every((row) => addable(row.pkgbase.trim()));
    }
    return true;
  });

  protected readonly canSubmit = computed(
    () => !this.pipelineTriggerService.isTriggering() && this.inputsValid() && this.scanReady(),
  );

  protected readonly scanReady = computed(() => {
    if (!this.showAddPackages()) return true;
    if (this.packageNames().length === 0) return true;
    return this.scansComplete();
  });

  protected readonly reviewEntries = computed(() =>
    Object.entries(this.toInputs(this.model())).filter((entry) => entry[1] !== ''),
  );

  protected readonly packageSuggestions = signal<string[]>([]);
  protected readonly aurSuggestions = signal<string[]>([]);
  protected readonly aurMissing = signal<Set<string>>(new Set());
  protected readonly existingPackages = signal<Set<string>>(new Set());

  protected readonly builderOptions = signal<Array<{ label: string; value: string }>>([
    { label: 'Default builder', value: DEFAULT_BUILDER },
  ]);
  protected readonly scheduleOptions = signal<Array<{ label: string; value: string; active: boolean }>>([]);
  protected readonly optionsFailed = signal(false);

  private readonly packageLookupSubject = new Subject<string>();
  private readonly aurLookupSubject = new Subject<string>();
  private syncedQueryParams: Record<string, string> | null = null;

  constructor() {
    // One debounced lookup per pause in typing, so the backend and the AUR are
    // not hammered on every keystroke. switchMap cancels stale responses that
    // arrive after the user already typed on.
    this.packageLookupSubject
      .pipe(
        distinctUntilChanged(),
        debounceTime(LOOKUP_DEBOUNCE_MS),
        switchMap((query) =>
          query.length < MIN_LOOKUP_LENGTH ? of([]) : this.pipelineTriggerService.searchChaoticPackages(query),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((suggestions) => this.packageSuggestions.set(suggestions));

    // AUR existence check: the exact name must be among its own suggestions.
    this.aurLookupSubject
      .pipe(
        distinctUntilChanged(),
        debounceTime(LOOKUP_DEBOUNCE_MS),
        switchMap(async (query) => {
          if (query.length < MIN_LOOKUP_LENGTH) return { query, suggestions: [] as string[], existsInChaotic: false };
          const [suggestions, existsInChaotic] = await Promise.all([
            this.pipelineTriggerService.getAurSuggestions(query),
            this.pipelineTriggerService.packageExists(query),
          ]);
          return { query, suggestions, existsInChaotic };
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ query, suggestions, existsInChaotic }) => {
        this.aurSuggestions.set(suggestions);

        const inAur = suggestions.includes(query);
        this.aurMissing.update((missing) => {
          const next = new Set(missing);
          if (inAur) next.delete(query);
          else next.add(query);
          return next;
        });
        if (existsInChaotic) {
          this.existingPackages.update((existing) => new Set(existing).add(query));
        }
      });

    // Every wizard choice is mirrored into the URL query string so the link can
    // be shared and the wizard state restored from it on load. The query string
    // is replaced in place via history.replaceState rather than routed, so
    // typing does not trigger a navigation that resets the page scroll to top.
    effect(() => this.syncQueryParams());

    this.observer
      .observe(MOBILE_QUERY)
      .pipe(takeUntilDestroyed())
      .subscribe((state) => this.isMobile.set(state.matches));
  }

  ngOnInit() {
    this.applyQueryParams();
    this.appService.updateSeoTags(this.meta, {
      title: 'Pipeline trigger',
      description: 'Trigger the Chaotic-AUR pipeline with the desired operation and inputs',
      keywords: 'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Pipeline, GitLab, CI',
      url: this.router.url,
    });
    void this.loadOptions();
  }

  protected setOperation(operation: PipelineOperation): void {
    if (this.model().operation === operation) return;
    this.model.update((model) => ({ ...model, operation }));
    if (this.isMobile()) {
      this.detailsSection().nativeElement.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }

  protected setSchedule(schedule: string): void {
    this.model.update((model) => ({ ...model, schedule }));
  }

  protected setRequestReason(reason: string): void {
    this.model.update((model) => ({ ...model, requestReason: reason }));
  }

  protected addPackageRow(): void {
    this.model.update((model) => ({
      ...model,
      packageRows: [...model.packageRows, { pkgbase: '', builder: DEFAULT_BUILDER }],
    }));
  }

  protected removePackageRow(index: number): void {
    this.model.update((model) => ({ ...model, packageRows: model.packageRows.toSpliced(index, 1) }));
  }

  protected setPackageRowPkgbase(index: number, pkgbase: string | null): void {
    // p-autocomplete emits null when its input is cleared.
    const value = pkgbase ?? '';
    this.model.update((model) => ({
      ...model,
      packageRows: model.packageRows.map((row, i) => (i === index ? { ...row, pkgbase: value } : row)),
    }));
    this.packageLookupSubject.next(value.trim());
  }

  protected onPackageRowBlur(index: number, event: Event): void {
    if ((event.target as HTMLInputElement).value.trim() === '') this.setPackageRowPkgbase(index, '');
  }

  protected setPackageRowBuilder(index: number, builder: string): void {
    this.model.update((model) => ({
      ...model,
      packageRows: model.packageRows.map((row, i) => (i === index ? { ...row, builder } : row)),
    }));
  }

  protected addAurRow(): void {
    this.model.update((model) => ({ ...model, addRows: [...model.addRows, { pkgbase: '' }] }));
  }

  protected removeAurRow(index: number): void {
    this.model.update((model) => ({ ...model, addRows: model.addRows.toSpliced(index, 1) }));
  }

  protected setAurRowPkgbase(index: number, pkgbase: string | null): void {
    // p-autocomplete emits null when its input is cleared.
    const value = pkgbase ?? '';
    this.model.update((model) => ({
      ...model,
      addRows: model.addRows.map((row, i) => (i === index ? { ...row, pkgbase: value } : row)),
    }));
    this.aurLookupSubject.next(value.trim());
  }

  protected onAurRowBlur(index: number, event: Event): void {
    if ((event.target as HTMLInputElement).value.trim() === '') this.setAurRowPkgbase(index, '');
  }

  protected onPackageSuggest(event: AutoCompleteCompleteEvent): void {
    this.packageLookupSubject.next(event.query.trim());
  }

  protected onAurSuggest(event: AutoCompleteCompleteEvent): void {
    this.aurLookupSubject.next(event.query.trim());
  }

  protected async submitTrigger(): Promise<void> {
    submit(this.triggerForm, async () => {
      await this.pipelineTriggerService.trigger(this.toInputs(this.model()));
    });
  }

  protected reset(): void {
    this.model.set(emptyModel());
    this.packageSuggestions.set([]);
    this.aurSuggestions.set([]);
    this.aurMissing.set(new Set());
    this.existingPackages.set(new Set());
  }

  private async loadOptions(): Promise<void> {
    try {
      const [builders, schedules] = await Promise.all([
        this.pipelineTriggerService.getActiveBuilders(),
        this.pipelineTriggerService.getSchedules(),
      ]);
      this.builderOptions.set([
        { label: 'Default builder', value: DEFAULT_BUILDER },
        ...builders.map((builder) => ({
          label: builder.name,
          // The class is the pipeline's builder identifier; fall back to the name.
          value: builder.builderClass ?? builder.name,
        })),
      ]);
      this.scheduleOptions.set(
        schedules
          .map((schedule) => ({
            label: schedule.description ?? `Schedule #${schedule.id}`,
            value: schedule.description ?? String(schedule.id),
            active: schedule.active,
          }))
          .sort((a, b) => Number(b.active) - Number(a.active)),
      );
    } catch (error) {
      this.optionsFailed.set(true);
      console.error('Failed to load builders or schedules:', error);
    }
  }

  private toInputs(model: PipelineTriggerFormModel): PipelineTriggerInputs {
    const inputs: PipelineTriggerInputs = { operation: model.operation };

    if (this.showPackages()) {
      inputs.packages = model.packageRows
        .map((row) => (row.builder === DEFAULT_BUILDER ? row.pkgbase.trim() : `${row.pkgbase.trim()}/${row.builder}`))
        .join(':');
    }
    if (this.showSchedule()) inputs.trigger = model.schedule;
    if (this.showAddPackages()) {
      inputs.add_packages = model.addRows.map((row) => `${row.pkgbase.trim()}/${AUR_SOURCE}`).join(' ');
      inputs.request_origin = model.requestOrigin.trim();
      if (model.requestReason !== 'unset') inputs.request_reason = model.requestReason;
      if (model.customRequestReason.trim() !== '') inputs.custom_request_reason = model.customRequestReason.trim();
    }

    return inputs;
  }

  private applyQueryParams(): void {
    const params = this.route.snapshot.queryParamMap;
    const operation = params.get('operation');
    const operationValid = operation !== null && PIPELINE_OPERATIONS.includes(operation as PipelineOperation);
    const restoredOperation: PipelineOperation = operationValid ? (operation as PipelineOperation) : 'None';
    if (restoredOperation === 'None') return;

    // "packages" is canonical; "pkg" and "packageName" are legacy single-name links.
    const packagesRaw = params.get('packages') ?? params.get('pkg') ?? params.get('packageName') ?? '';
    const names = packagesRaw
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name !== '');

    const reason = params.get('reason');
    const reasonValid = reason !== null && PIPELINE_REQUEST_REASONS.includes(reason as PipelineRequestReason);

    this.model.update((model) => ({
      ...model,
      operation: restoredOperation,
      packageRows:
        names.length > 0 && OPERATIONS_REQUIRING_PACKAGES.includes(restoredOperation)
          ? names.map((name) => {
              const [pkgbase, builder] = name.split('/');
              return { pkgbase, builder: builder ?? DEFAULT_BUILDER };
            })
          : model.packageRows,
      addRows: names.length > 0 && restoredOperation === 'Add Packages' ? names.map(toAddRow) : model.addRows,
      schedule: params.get('schedule') ?? model.schedule,
      requestOrigin: params.get('origin') ?? model.requestOrigin,
      requestReason: reasonValid ? (reason as PipelineRequestReason) : model.requestReason,
      customRequestReason: params.get('customReason') ?? model.customRequestReason,
    }));
  }

  private queryParamsFor(model: PipelineTriggerFormModel): Record<string, string> {
    const names =
      model.operation === 'Add Packages'
        ? model.addRows.map((row) => row.pkgbase.trim()).filter((name) => name !== '')
        : model.packageRows
            .map((row) =>
              row.builder === DEFAULT_BUILDER ? row.pkgbase.trim() : `${row.pkgbase.trim()}/${row.builder}`,
            )
            .filter((name) => name !== '' && name !== '/');

    return definedOnly({
      operation: model.operation === 'None' ? undefined : model.operation,
      packages: names.length > 0 ? names.join(',') : undefined,
      schedule: model.schedule === '' ? undefined : model.schedule,
      origin: model.requestOrigin === '' ? undefined : model.requestOrigin,
      reason: model.requestReason === 'unset' ? undefined : model.requestReason,
      customReason: model.customRequestReason === '' ? undefined : model.customRequestReason,
    });
  }

  private syncQueryParams(): void {
    const queryParams = this.queryParamsFor(this.model());
    if (this.syncedQueryParams !== null && queryParamsEqual(this.syncedQueryParams, queryParams)) return;
    const url = this.router.createUrlTree([], { relativeTo: this.route, queryParams }).toString();
    history.replaceState(null, '', url);
    this.syncedQueryParams = queryParams;
  }
}

function queryParamsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  if (a === b) return true;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => a[key] === b[key]);
}

function definedOnly(params: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function toAddRow(name: string): AddPackageRow {
  const [pkgbase] = name.split('/');
  return { pkgbase };
}
