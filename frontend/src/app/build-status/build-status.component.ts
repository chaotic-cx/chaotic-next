import { Build, BuildClass, BuildStatus, PipelineWithExternalStatus } from '@./shared-lib';
import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { Mutex } from 'async-mutex';
import { Card } from 'primeng/card';
import { Dialog } from 'primeng/dialog';
import { Ripple } from 'primeng/ripple';
import { Skeleton } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { Timeline } from 'primeng/timeline';
import { Tooltip } from 'primeng/tooltip';
import { retry } from 'rxjs';
import { AppService } from '../app.service';
import { startShortPolling } from '../functions';
import { BuildClassPipe } from '../pipes/build-class.pipe';
import { TitleComponent } from '../title/title.component';

@Component({
  selector: 'chaotic-build-status',
  imports: [
    CommonModule,
    Timeline,
    Card,
    TableModule,
    BuildClassPipe,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    TitleComponent,
    Dialog,
    Tooltip,
    Skeleton,
    Ripple,
  ],
  templateUrl: './build-status.component.html',
  styleUrl: './build-status.component.css',
  providers: [MessageToastService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BuildStatusComponent implements OnInit {
  isWide = signal<boolean>(true);
  lastUpdated = signal<Date | undefined>(undefined);
  loadingQueue = signal<boolean>(true);
  loadingDeployments = signal<boolean>(true);
  loadingPipelines = signal<boolean>(true);

  updateMutex = new Mutex();

  latestDeployments!: Build[];
  activeQueue: {
    name: string;
    build_class: BuildClass;
    node: string;
    liveLogUrl: string;
  }[] = [];
  waitingQueue: {
    name: string;
    build_class: BuildClass;
  }[] = [];
  idleQueue: {
    name: string;
    build_class: BuildClass;
  }[] = [];

  appService = inject(AppService);
  cdr = inject(ChangeDetectorRef);
  messageToastService = inject(MessageToastService);
  meta = inject(Meta);
  observer = inject(BreakpointObserver);
  router = inject(Router);

  dialogData = signal<PipelineWithExternalStatus>({
    pipeline: {},
    commit: [],
  } as unknown as PipelineWithExternalStatus); // Workaround for silencing Angular warning
  dialogVisible = signal<boolean>(false);
  pipelineWithStatus = signal<PipelineWithExternalStatus[]>([]);

  async ngOnInit(): Promise<void> {
    this.appService.updateSeoTags(
      this.meta,
      'Build status',
      'Current build status and queue information for Chaotic-AUR',
      'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR build status',
      this.router.url,
    );

    this.observer.observe(`(max-width: 1100px)`).subscribe((state) => {
      this.isWide.set(!state.matches);
      this.cdr.markForCheck();
    });

    void this.updateAll(false);

    startShortPolling(15000, async (): Promise<void> => {
      void this.updateAll(true);
    });
  }

  /**
   * Update all the data on the page and set the last updated time
   */
  async updateAll(inBackground = false): Promise<void> {
    void this.updateMutex.runExclusive(async () => {
      await Promise.all([
        this.getQueueStats(inBackground),
        this.getPipelines(inBackground),
        this.getPackageBuilds(inBackground),
      ]);

      if (this.dialogVisible()) {
        this.dialogData.set(
          this.pipelineWithStatus()!.find(
            (pipeline) => pipeline.pipeline.id === this.dialogData().pipeline.id,
          ) as PipelineWithExternalStatus,
        );
      }

      this.lastUpdated.set(new Date());
      this.cdr.markForCheck();
    });
  }

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
            this.latestDeployments = data;
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
                  this.activeQueue = tableData;
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
                  this.waitingQueue = tableData;
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
                  this.idleQueue = tableData;
                  break;
                }
              }
            }

            // Finally, update the component's state
            this.lastUpdated.set(new Date());
            this.cdr.detectChanges();
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

  typed(value: any): PipelineWithExternalStatus {
    return value;
  }

  typedDeployment(untypedDeployment: Build) {
    return untypedDeployment;
  }

  showDialog(pipelineId: number) {
    this.dialogData.set(
      this.pipelineWithStatus()!.find((pipeline) => pipeline.pipeline.id === pipelineId) as PipelineWithExternalStatus,
    );
    this.dialogVisible.set(true);
  }

  createRange(number: number): number[] {
    return new Array(number).fill(0).map((n, index) => index + 1);
  }
}
