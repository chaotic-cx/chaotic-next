import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Build, BuildClass, BuildStatus, GitLabPipeline } from '@./shared-lib';
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

@Component({
  selector: 'chaotic-build-status',
  imports: [CommonModule, Timeline, Card, TableModule, BuildClassPipe, Tabs, TabList, Tab, TabPanels, TabPanel],
  templateUrl: './build-status.component.html',
  styleUrl: './build-status.component.css',
  providers: [MessageToastService],
})
export class BuildStatusComponent implements OnInit {
  isWide!: boolean;
  lastUpdated: Date | undefined;
  loading = true;
  pipelines: GitLabPipeline[] = [];
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
    this.appService.getPipelines().subscribe({
      next: (data) => {
        this.pipelines = data;
      },
      error: (err) => {
        console.error(err);
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

  typed(value: any): GitLabPipeline {
    return value;
  }

  typedDeployment(untypedDeployment: Build) {
    return untypedDeployment;
  }
}
