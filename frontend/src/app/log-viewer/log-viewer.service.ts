import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import type { GitlabJob } from '@chaotic-next/shared-lib';
import { lastValueFrom } from 'rxjs';
import { APP_CONFIG } from '../../environments/app-config.token';

@Service()
export class LogViewerService {
  private readonly http = inject(HttpClient);
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;

  /** Jobs of a pipeline, for the job selector. */
  getJobs(pipelineId: number): Promise<GitlabJob[]> {
    return lastValueFrom(this.http.get<GitlabJob[]>(`${this.backendUrl}/gitlab/pipelines/${pipelineId}/jobs`));
  }

  /** EventSource URL of a job's live trace; `offset` resumes a dropped stream. */
  traceStreamUrl(pipelineId: number, jobId: number, offset = 0): string {
    const base = `${this.backendUrl}/gitlab/pipelines/${pipelineId}/jobs/${jobId}/trace`;
    const params = new URLSearchParams({ 'ngsw-bypass': '' });
    if (offset > 0) params.set('offset', String(offset));
    return `${base}?${params.toString()}`;
  }
}
