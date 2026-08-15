import {
  PIPELINE_PKG_BASE_REGEX,
  PIPELINE_REQUEST_REASONS,
  type PipelineOperation,
  type PipelineRequestReason,
  type PipelineTriggerInputs,
} from '@chaotic-next/shared-lib';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { applyEach, FormField, form, pattern, required, submit } from '@angular/forms/signals';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { AutoComplete, AutoCompleteCompleteEvent } from '@openng/optimus-ui/autocomplete';
import { Button } from '@openng/optimus-ui/button';
import { InputText } from '@openng/optimus-ui/inputtext';
import { Select } from '@openng/optimus-ui/select';
import { Step, StepList, StepPanel, StepPanels, Stepper } from '@openng/optimus-ui/stepper';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { Subject, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { AppService } from '../app.service';
import { TitleComponent } from '../title/title.component';
import { PipelineTriggerService } from './pipeline-trigger.service';

const OPERATIONS_REQUIRING_PACKAGES: PipelineOperation[] = ['Bump Packages', 'Schedule Packages', 'Drop Packages'];
const LOOKUP_DEBOUNCE_MS = 300;
const MIN_LOOKUP_LENGTH = 2;

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
    Button,
    FormField,
    FormsModule,
    InputText,
    Select,
    Step,
    StepList,
    StepPanel,
    StepPanels,
    Stepper,
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

  protected readonly pipelineTriggerService = inject(PipelineTriggerService);

  protected readonly operationStep = 0;
  protected readonly inputsStep = 1;
  protected readonly reviewStep = 2;

  protected readonly operationCards: Array<{ operation: PipelineOperation; description: string }> = [
    { operation: 'Bump Packages', description: 'Rebuild the selected packages now.' },
    { operation: 'Schedule Packages', description: 'Queue the selected packages for building.' },
    { operation: 'Run Schedule', description: 'Trigger one of the pipeline schedules.' },
    { operation: 'Drop Packages', description: 'Remove the selected packages from the repository.' },
    { operation: 'Add Packages', description: 'Add new packages from the AUR to the repository.' },
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

  protected readonly step = signal(this.operationStep);

  protected readonly showPackages = computed(() => OPERATIONS_REQUIRING_PACKAGES.includes(this.model().operation));
  protected readonly showSchedule = computed(() => this.model().operation === 'Run Schedule');
  protected readonly showAddPackages = computed(() => this.model().operation === 'Add Packages');
  protected readonly showBuilderSelect = computed(
    () => this.model().operation !== 'Drop Packages' && this.model().operation !== 'Bump Packages',
  );

  protected readonly steps = computed(() => {
    const inputLabel = this.showSchedule() ? 'Schedule' : this.showAddPackages() ? 'New packages' : 'Packages';
    return this.showInputsStep()
      ? [
          { label: 'Operation', value: this.operationStep },
          { label: inputLabel, value: this.inputsStep },
          { label: 'Review', value: this.reviewStep },
        ]
      : [
          { label: 'Operation', value: this.operationStep },
          { label: 'Review', value: this.reviewStep },
        ];
  });

  protected readonly inputsValid = computed(() => {
    // "None" is only the initial state; an operation must be picked.
    if (this.model().operation === 'None') return false;
    if (!this.triggerForm().valid()) return false;
    const model = this.model();
    if (OPERATIONS_REQUIRING_PACKAGES.includes(model.operation)) return model.packageRows.length > 0;
    if (model.operation === 'Add Packages') {
      return model.addRows.length > 0 && model.addRows.every((row) => !this.aurMissing().has(row.pkgbase.trim()));
    }
    return true;
  });

  protected readonly canSubmit = computed(() => !this.pipelineTriggerService.isTriggering() && this.inputsValid());

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
  }

  ngOnInit() {
    this.appService.updateSeoTags(this.meta, {
      title: 'Pipeline trigger',
      description: 'Trigger the Chaotic-AUR pipeline with the desired operation and inputs',
      keywords: 'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Pipeline, GitLab, CI',
      url: this.router.url,
    });
    void this.loadOptions();
  }

  protected onStepChange(value: number | undefined): void {
    if (value !== undefined) this.step.set(value);
  }

  protected nextStep(): void {
    const values = this.steps().map((wizardStep) => wizardStep.value);
    const nextIndex = values.indexOf(this.step()) + 1;
    if (nextIndex > 0 && nextIndex < values.length) this.step.set(values[nextIndex]);
  }

  protected previousStep(): void {
    const values = this.steps().map((wizardStep) => wizardStep.value);
    const previousIndex = values.indexOf(this.step()) - 1;
    if (previousIndex >= 0) this.step.set(values[previousIndex]);
  }

  protected setOperation(operation: PipelineOperation): void {
    this.model.update((model) => ({ ...model, operation }));
    this.step.set(this.operationStep);
  }

  protected pickOperation(operation: PipelineOperation): void {
    this.setOperation(operation);
    this.nextStep();
  }

  protected pickSchedule(schedule: string): void {
    this.setSchedule(schedule);
    this.nextStep();
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
    this.step.set(this.operationStep);
    this.packageSuggestions.set([]);
    this.aurSuggestions.set([]);
    this.aurMissing.set(new Set());
    this.existingPackages.set(new Set());
  }

  private showInputsStep(): boolean {
    return this.model().operation !== 'None';
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
}
