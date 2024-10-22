import type { CurrentQueue, GitLabPipeline } from "@./shared-lib";
import { DatePipe } from "@angular/common";
import { AfterViewInit, ChangeDetectorRef, Component } from "@angular/core";
import { Router } from "@angular/router";
import { AppService } from "../app.service";
import { DeployLogComponent } from "../deploy-log/deploy-log.component";
import { startShortPolling } from "../functions";
import { LiveLogComponent } from "../live-log/live-log.component";
import { BuildClassPipe } from "../pipes/build-class.pipe";

@Component({
    selector: "app-status",
    standalone: true,
    imports: [DeployLogComponent, LiveLogComponent, DatePipe, BuildClassPipe],
    templateUrl: "./status.component.html",
    styleUrl: "./status.component.css",
})
export class StatusComponent implements AfterViewInit {
    currentQueue: CurrentQueue = [];
    fullLength = 0;
    lastUpdated: Date | undefined;
    loading = true;
    showFullPackages = false;
    nothingGoingOn = false;
    Object = Object;
    pipelines: GitLabPipeline[] = [];
    liveLog: undefined | string = undefined;
    displayLiveLog = true;
    activeBuilds = 0;
    currentBuild = 0;

    constructor(
        private appService: AppService,
        private cdr: ChangeDetectorRef,
        private router: Router,
    ) {
        const cachedState = localStorage.getItem("currentBuild");
        if (cachedState !== null) this.currentBuild = Number(cachedState);

        const cachedStateLiveLog = localStorage.getItem("displayLiveLog");
        if (cachedStateLiveLog !== null) this.displayLiveLog = localStorage.getItem("displayLiveLog") === "true";
    }

    async ngAfterViewInit(): Promise<void> {
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
                this.pipelines = data.filter(
                    (pipeline: GitLabPipeline) => pipeline.status === ("running" || "pending"),
                );
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

        const returnQueue: CurrentQueue = [];

        this.appService.getQueueStats().subscribe({
            next: (currentQueue) => {
                for (const queue of Object.keys(currentQueue)) {
                    const nameWithoutRepo: string[] = [];
                    const build_class: (null | number)[] = [];
                    const nodes: string[] = [];
                    const liveLogUrl: string[] = [];

                    switch (queue) {
                        case "active":
                            for (const pkg of currentQueue.active.packages) {
                                nameWithoutRepo.push(pkg.name.split("/")[2]);
                                build_class.push(pkg.build_class);
                                nodes.push(pkg.node);
                                liveLogUrl.push(pkg.liveLog ? pkg.liveLog : "");
                            }
                            returnQueue.push({
                                status: "active",
                                count: currentQueue.active.count,
                                packages: nameWithoutRepo,
                                build_class: build_class,
                                nodes: nodes,
                                liveLogUrl: liveLogUrl,
                            });
                            break;
                        case "waiting":
                            for (const pkg of currentQueue.waiting.packages) {
                                nameWithoutRepo.push(pkg.name.split("/")[2]);
                                build_class.push(pkg.build_class);
                            }
                            returnQueue.push({
                                status: "waiting",
                                count: currentQueue.waiting.count,
                                packages: nameWithoutRepo,
                                build_class: build_class,
                            });
                            break;
                        case "idle":
                            returnQueue.push({
                                status: "idle",
                                count: currentQueue.idle.count,
                                nodes: currentQueue.idle.nodes.map((node) => node.name),
                                build_class: currentQueue.idle.nodes.map((node) => node.build_class),
                            });
                            break;
                    }
                }

                // Calculate the full length of the queue
                let length = 0;
                for (const queue of returnQueue) {
                    if (queue.packages) length += queue.count;
                }
                this.fullLength = length;

                // If the full list is too long, shorten it.
                if (this.fullLength >= 50 && !this.showFullPackages) {
                    for (const queue of returnQueue) {
                        if (queue.packages && queue.packages.length > 50) {
                            queue.packages?.splice(50);
                            queue.packages?.push("...");
                        }
                    }
                }

                // Finally, update the component's state
                this.lastUpdated = new Date();

                // Check if there is nothing going on
                this.nothingGoingOn =
                    returnQueue.findIndex((queue) => queue.status !== "idle" && queue.count > 0) === -1;

                // Check if there is a live log to display and handle changes accordingly
                if (!this.nothingGoingOn) {
                    this.toggleLogStream();
                } else {
                    this.liveLog = undefined;
                }

                this.currentQueue = returnQueue;
                this.cdr.detectChanges();
                this.loading = false;
            },
            error: (err) => {
                console.error(err);
            },
            complete: () => {
                this.loading = false;
            },
        });
    }

    /**
     * Replace currentList with fullList. For people who want to display the full list.
     */
    showFullList(): void {
        if (!this.showFullPackages) {
            void this.getQueueStats(false);
            this.showFullPackages = true;
        } else {
            void this.getQueueStats(false);
            this.showFullPackages = false;
        }
    }

    /**
     * Redirect to the full deployments page using the Angular router.
     */
    headToFullDeployments(): void {
        void this.router.navigate(["/deploy-log"]);
    }

    /**
     * Toggle the display of the live log. Saves the state in localStorage.
     */
    toggleLiveLog(): void {
        this.displayLiveLog = !this.displayLiveLog;
        this.cdr.detectChanges();
        localStorage.setItem("displayLiveLog", this.displayLiveLog.toString());
    }

    /**
     * Show the next live log of the active builds.
     */
    toggleLogStream(): void {
        const activeQueue = this.currentQueue.find((queue) => queue.status === "active");
        if (!activeQueue) return;

        if (this.currentBuild + 2 <= this.activeBuilds) {
            this.currentBuild++;
            this.liveLog = activeQueue.liveLogUrl![this.currentBuild];
            localStorage.setItem("currentBuild", this.currentBuild.toString());
        } else {
            this.currentBuild = 0;
            this.liveLog = activeQueue.liveLogUrl![0];
            localStorage.setItem("currentBuild", this.currentBuild.toString());
        }
        this.cdr.detectChanges();
    }
}
