import { PipelineScheduleOption, PipelineTriggerInputs, PipelineTriggerResult } from '@chaotic-next/shared-lib';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Service, signal } from '@angular/core';
import { MessageToastService } from '@garudalinux/core';
import { lastValueFrom } from 'rxjs';
import { APP_CONFIG } from '../../environments/app-config.token';

interface PackageListResponse {
  items: Array<{ pkgname: string }>;
}

interface BuilderEntry {
  name: string;
  builderClass: string | null;
  isActive: boolean;
}

@Service()
export class PipelineTriggerService {
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;
  private readonly http = inject(HttpClient);
  private readonly messageToastService = inject(MessageToastService);

  readonly isTriggering = signal(false);
  readonly lastResult = signal<PipelineTriggerResult | null>(null);

  async trigger(inputs: PipelineTriggerInputs): Promise<void> {
    this.isTriggering.set(true);
    try {
      const result = await lastValueFrom(
        this.http.post<PipelineTriggerResult>(`${this.backendUrl}/gitlab/trigger`, inputs),
      );
      this.lastResult.set(result);
      this.messageToastService.success(
        'Pipeline triggered',
        `Pipeline #${result.pipelineId} has been triggered and is now ${result.status}.`,
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 400) {
        this.messageToastService.error(
          'Invalid input',
          typeof error.error?.message === 'string' ? error.error.message : 'The pipeline inputs are invalid.',
        );
        return;
      }
      this.messageToastService.error('Trigger failed', 'Failed to trigger the pipeline. Please try again later.');
      console.error('Error triggering pipeline:', error);
    } finally {
      this.isTriggering.set(false);
    }
  }

  async getAurSuggestions(query: string): Promise<string[]> {
    try {
      return await lastValueFrom(
        this.http.get<string[]>(`${this.backendUrl}/aur/suggestions`, { params: { q: query } }),
      );
    } catch {
      return [];
    }
  }

  async searchChaoticPackages(query: string): Promise<string[]> {
    try {
      const result = await lastValueFrom(
        this.http.get<PackageListResponse>(`${this.backendUrl}/builder/packages`, {
          params: { q: query, page: '1', perPage: '20' },
        }),
      );
      return [...new Set(result.items.map((pkg) => pkg.pkgname))];
    } catch {
      return [];
    }
  }

  async getActiveBuilders(): Promise<Array<{ name: string; builderClass: string | null }>> {
    const builders = await lastValueFrom(this.http.get<BuilderEntry[]>(`${this.backendUrl}/builder/builders`));
    return builders.filter((builder) => builder.isActive);
  }

  async getSchedules(): Promise<PipelineScheduleOption[]> {
    return await lastValueFrom(this.http.get<PipelineScheduleOption[]>(`${this.backendUrl}/gitlab/schedules`));
  }

  async packageExists(pkgbase: string): Promise<boolean> {
    try {
      const result = await lastValueFrom(
        this.http.get<PackageListResponse>(`${this.backendUrl}/builder/packages`, {
          params: { q: pkgbase, page: '1', perPage: '10' },
        }),
      );
      return result.items.some((pkg) => pkg.pkgname === pkgbase);
    } catch {
      return false;
    }
  }
}
