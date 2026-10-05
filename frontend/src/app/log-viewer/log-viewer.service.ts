import { inject, Service } from '@angular/core';
import { APP_CONFIG } from '../../environments/app-config.token';

@Service()
export class LogViewerService {
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;

  /** Jobs of a pipeline, for the job selector. */
  getJobsUrl(pipelineId: number): string {
    return `${this.backendUrl}/gitlab/pipelines/${pipelineId}/jobs`;
  }

  /** EventSource URL of a job's live trace; `offset` resumes a dropped stream. */
  traceStreamUrl(pipelineId: number, jobId: number, offset = 0): string {
    const base = `${this.backendUrl}/gitlab/pipelines/${pipelineId}/jobs/${jobId}/trace`;
    const params = new URLSearchParams({ 'ngsw-bypass': '' });
    if (offset > 0) params.set('offset', String(offset));
    return `${base}?${params.toString()}`;
  }
}
