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

  /** EventSource URL of a job's live trace. */
  traceStreamUrl(pipelineId: number, jobId: number): string {
    return `${this.backendUrl}/gitlab/pipelines/${pipelineId}/jobs/${jobId}/trace?ngsw-bypass`;
  }
}
