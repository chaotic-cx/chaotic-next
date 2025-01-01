import { ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Build, BuildClass, BuildStatus, PipelineWithExternalStatus } from '@./shared-lib';
import { Timeline } from 'primeng/timeline';
import { Card } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { BuildClassPipe } from '../pipes/build-class.pipe';
import { AppService } from '../app.service';
import { startShortPolling } from '../functions';
import { retry } from 'rxjs';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { MessageToastService } from '@garudalinux/core';
import { TitleComponent } from '../title/title.component';
import { Dialog } from 'primeng/dialog';

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
  ],
  templateUrl: './build-status.component.html',
  styleUrl: './build-status.component.css',
  providers: [MessageToastService],
})
export class BuildStatusComponent implements OnInit {
  isWide!: boolean;
  lastUpdated: Date | undefined;
  loading = true;
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
  observer = inject(BreakpointObserver);

  dialogData!: PipelineWithExternalStatus;
  dialogVisible = signal<boolean>(false);
  pipelineWithStatus!: PipelineWithExternalStatus[];

  async ngOnInit(): Promise<void> {
    this.observer.observe(`(max-width: 1100px)`).subscribe((state) => {
      this.isWide = !state.matches;
    });

    this.appService
      .getPackageBuilds(20, BuildStatus.SUCCESS)
      .pipe(retry({ delay: 2000 }))
      .subscribe({
        next: (data) => {
          this.latestDeployments = data;
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to fetch latest deployments');
          console.error(err);
        },
        complete: () => {
          this.loading = false;
        },
      });

    void this.getQueueStats(false);
    void this.getPipelines();

    startShortPolling(5000, async (): Promise<void> => {
      await this.getQueueStats(true);
      await this.getPipelines();
    });
  }

  /**
   * Get current pipeline status
   */
  async getPipelines() {
    this.appService.getStatusChecks(1).subscribe({
      next: (pipelines) => {
        for (const pipeline of pipelines) {
          if (pipeline.pipeline.status === 'failed') {
            let failedJobs = 0;
            for (const job of pipeline.commit) {
              if (job.status === 'failed') {
                failedJobs++;
              }
              job.name = job.name.split(': ')[1];
            }
            pipeline.pipeline.status = `${failedJobs}/${pipeline.commit.length} failed`;
          } else if (pipeline.pipeline.status === 'canceled') {
            pipeline.pipeline.status = 'success';
          }
        }
        this.pipelineWithStatus = pipelines;
      },
      error: (err) => {
        console.error(err);
      },
      complete: () => {
        this.loading = false;
      },
    });
  }

  /*
   * Get the current queue stats from the Chaotic backend
   * @param inBackground Whether the request is in the background or not
   */
  async getQueueStats(inBackground: boolean): Promise<void> {
    this.loading = !inBackground;
    if (!inBackground) this.lastUpdated = undefined;

    this.appService.getQueueStats().subscribe({
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
        this.lastUpdated = new Date();
        this.cdr.detectChanges();
        this.loading = false;
      },
      error: (err) => {
        this.messageToastService.error('Error', 'Failed to fetch queue stats');
        console.error(err);
      },
      complete: () => {
        this.loading = false;
      },
    });
  }

  typed(value: any): PipelineWithExternalStatus {
    return value;
  }

  typedDeployment(untypedDeployment: Build) {
    return untypedDeployment;
  }

  showDialog(pipelineId: number) {
    this.dialogData = this.pipelineWithStatus.find(
      (pipeline) => pipeline.pipeline.id === pipelineId,
    ) as PipelineWithExternalStatus;
    this.dialogVisible.set(true);
  }
}
