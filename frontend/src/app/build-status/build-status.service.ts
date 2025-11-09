import { inject, Injectable, signal } from '@angular/core';
import { Build, BuildClass, BuildStatus, PipelineWithExternalStatus } from '@./shared-lib';
import { Mutex } from 'async-mutex';
import { AppService } from '../app.service';
import { retry } from 'rxjs';
import { MessageToastService } from '@garudalinux/core';

@Injectable({
  providedIn: 'root',
})
export class BuildStatusService {
  readonly lastUpdated = signal<Date | undefined>(undefined);
  readonly loadingQueue = signal<boolean>(true);
  readonly loadingDeployments = signal<boolean>(true);
  readonly loadingPipelines = signal<boolean>(true);
  readonly pipelineWithStatus = signal<PipelineWithExternalStatus[]>([]);

  updateMutex = new Mutex();

  readonly latestDeployments = signal<Build[]>([]);
  readonly activeQueue = signal<
    {
      name: string;
      build_class: BuildClass;
      node: string;
      liveLogUrl: string;
    }[]
  >([]);
  readonly waitingQueue = signal<
    {
      name: string;
      build_class: BuildClass;
    }[]
  >([]);
  readonly idleQueue = signal<
    {
      name: string;
      build_class: BuildClass;
    }[]
  >([]);

  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);

  /**
   * Get the latest deployments
   */
  async getPackageBuilds(inBackground = false): Promise<void> {
    this.loadingDeployments.set(!inBackground);

    await new Promise<void>((resolve, reject) => {
      this.appService
        .getPackageBuilds(20, BuildStatus.SUCCESS)
        .pipe(retry({ delay: 5000, count: 3 }))
        .subscribe({
          next: (data) => {
            this.latestDeployments.set(data);
          },
          error: (err) => {
            this.messageToastService.error('Error', 'Failed to fetch latest deployments');
            console.error(err);
          },
          complete: () => {
            this.loadingDeployments.set(false);
          },
        });
    });
  }

  /**
   * Get current pipeline status
   */
  async getPipelines(inBackground = false): Promise<void> {
    this.loadingPipelines.set(!inBackground);
    await new Promise<void>((resolve, reject) => {
      this.appService
        .getStatusChecks()
        .pipe(retry({ delay: 5000, count: 3 }))
        .subscribe({
          next: (pipelines) => {
            this.transformPipelineData(pipelines);
          },
          error: (err) => {
            if (!inBackground) {
              this.messageToastService.error('Error', 'Failed to fetch pipeline status');
            }
            console.error(err);
            reject(err);
          },
          complete: () => {
            this.loadingPipelines.set(false);
            resolve();
          },
        });
    });
  }

  /**
   * Transform the pipeline data to include failed job counts and clean job names.
   * @param pipelines The array of pipelines to transform.
   */
  transformPipelineData(pipelines: PipelineWithExternalStatus[]) {
    for (const pipeline of pipelines) {
      if (pipeline.pipeline.status === 'failed') {
        let failedJobs = 0;
        for (const job of pipeline.commit) {
          if (job.status === 'failed') {
            failedJobs++;
          }
        }
        pipeline.pipeline.status = `${failedJobs}/${pipeline.commit.length} failed`;
      } else if (pipeline.pipeline.status === 'canceled') {
        pipeline.pipeline.status = 'success';
      }

      for (const job of pipeline.commit) {
        job.name = job.name.split(': ')[1];
      }
    }
    if (pipelines.length > 20) {
      pipelines = pipelines.slice(0, 20);
    }
    this.pipelineWithStatus.set(pipelines);
  }

  /*
   * Get the current queue stats from the Chaotic backend
   * @param inBackground Whether the request is in the background or not
   */
  async getQueueStats(inBackground: boolean): Promise<void> {
    this.loadingQueue.set(!inBackground);
    await new Promise<void>((resolve, reject) => {
      this.appService
        .getQueueStats()
        .pipe(retry({ delay: 5000, count: 3 }))
        .subscribe({
          next: (currentQueue) => {
            for (const queue of Object.keys(currentQueue)) {
              switch (queue) {
                case 'active': {
                  const tableData = [];
                  for (const pkg of currentQueue.active.packages) {
                    tableData.push({
                      name: pkg.name.split('/')[2],
                      build_class: pkg.build_class as BuildClass,
                      node: pkg.node,
                      liveLogUrl: pkg.liveLog ? pkg.liveLog : '',
                    });
                  }
                  this.activeQueue.set(tableData);
                  break;
                }
                case 'waiting': {
                  const tableData = [];
                  for (const pkg of currentQueue.waiting.packages) {
                    tableData.push({
                      name: pkg.name.split('/')[2],
                      build_class: pkg.build_class as BuildClass,
                    });
                  }
                  this.waitingQueue.set(tableData);
                  break;
                }
                case 'idle': {
                  const tableData = [];
                  for (const node of currentQueue.idle.nodes) {
                    tableData.push({
                      name: node.name,
                      build_class: node.build_class as BuildClass,
                    });
                  }
                  this.idleQueue.set(tableData);
                  break;
                }
              }
            }

            // Finally, update the component's state
            this.lastUpdated.set(new Date());
          },
          error: (err) => {
            if (!inBackground) {
              this.messageToastService.error('Error', 'Failed to fetch queue stats');
            }
            console.error(err);
            reject(err);
          },
          complete: () => {
            this.loadingQueue.set(false);
            resolve();
          },
        });
    });
  }
}
