import { CAUR_API_URL, type CurrentQueue, startShortPolling, type StatsObject } from "@./shared-lib"
import { AfterViewInit, ChangeDetectorRef, Component } from "@angular/core"
import { Router } from "@angular/router"
import { Axios } from "axios"
import { DeployLogComponent } from "../deploy-log/deploy-log.component"
import { LiveLogComponent } from "../live-log/live-log.component"

@Component({
    selector: "app-status",
    standalone: true,
    imports: [DeployLogComponent, LiveLogComponent],
    templateUrl: "./status.component.html",
    styleUrl: "./status.component.css"
})
export class StatusComponent implements AfterViewInit {
    currentQueue: CurrentQueue = []
    fullLength = 0
    lastUpdated: string | undefined
    loading = true
    showFullPackages = false
    nothingGoingOn = false
    Object = Object
    liveLog: undefined | string = undefined
    displayLiveLog: boolean = true

    constructor(private cdr: ChangeDetectorRef, private router: Router) {
        this.displayLiveLog = localStorage.getItem("displayLiveLog") === "true"
    }

    async ngAfterViewInit(): Promise<void> {
        void this.getQueueStats(false)

        startShortPolling(5000, async (): Promise<void> => {
            await this.getQueueStats(true)
        })
    }

    /*
     * Get the current queue stats from the Chaotic backend
     * @param inBackground Whether the request is in the background or not
     */
    async getQueueStats(inBackground: boolean): Promise<void> {
        this.loading = !inBackground
        if (!inBackground) this.lastUpdated = undefined

        const returnQueue: CurrentQueue = []
        const axios = new Axios({
            baseURL: CAUR_API_URL,
            timeout: 10000
        })
        
        axios
            .get("queue/stats")
            .then((response) => {
                const currentQueue: StatsObject = JSON.parse(response.data)
                for (const queue of Object.keys(currentQueue)) {
                    const nameWithoutRepo: string[] = []
                    const build_class: (string | number)[] = []
                    const nodes: string[] = []
                    const liveLogUrl: string[] = []

                    switch (queue) {
                        case "active":
                            currentQueue.active.packages.forEach((pkg): void => {
                                nameWithoutRepo.push(pkg.name.split("/")[2])
                                build_class.push(pkg.build_class)
                                nodes.push(pkg.node)
                                liveLogUrl.push(pkg.liveLog ? pkg.liveLog : "")
                            })
                            returnQueue.push({
                                status: "active",
                                count: currentQueue.active.count,
                                packages: nameWithoutRepo,
                                build_class: build_class,
                                nodes: nodes,
                                liveLogUrl: liveLogUrl
                            })
                            break
                        case "waiting":
                            currentQueue.waiting.packages.forEach((pkg): void => {
                                nameWithoutRepo.push(pkg.name.split("/")[2])
                                build_class.push(pkg.build_class)
                            })
                            returnQueue.push({
                                status: "waiting",
                                count: currentQueue.waiting.count,
                                packages: nameWithoutRepo,
                                build_class: build_class
                            })
                            break
                        case "idle":
                            returnQueue.push({
                                status: "idle",
                                count: currentQueue.idle.count,
                                nodes: currentQueue.idle.nodes.map((node) => node.name),
                                build_class: currentQueue.idle.nodes.map((node) => node.build_class)
                            })
                            break
                    }
                }

                // Calculate the full length of the queue
                let length = 0
                returnQueue.forEach((queue) => {
                    if (queue.packages) length += queue.count
                })
                this.fullLength = length

                // If the full list is too long, shorten it.
                if (this.fullLength >= 50 && !this.showFullPackages) {
                    returnQueue.forEach((queue) => {
                        if (queue.packages && queue.packages.length > 50) {
                            queue.packages?.splice(50)
                            queue.packages?.push("...")
                        }
                    })
                }

                // Finally, update the component's state
                this.lastUpdated = new Date().toLocaleString("en-GB", {
                    timeZone: "UTC"
                })

                this.nothingGoingOn = returnQueue.findIndex((queue) => queue.status !== "idle" && queue.count > 0) === -1
                if (!this.nothingGoingOn) {
                    const activeQueue = returnQueue.find((queue) => queue.status === "active")
                    if (this.liveLog !== activeQueue!.liveLogUrl![0]) {
                        this.liveLog = undefined
                        this.liveLog = activeQueue!.liveLogUrl![0]
                    }
                } else {
                    this.liveLog = undefined
                }

                this.cdr.detectChanges()

                this.currentQueue = returnQueue
                this.loading = false
            })
            .catch((err) => {
                console.error(err)
            })
    }

    /**
     * Replace currentList with fullList. For people who want to display the full list.
     */
    showFullList(): void {
        if (!this.showFullPackages) {
            void this.getQueueStats(false)
            this.showFullPackages = true
        } else {
            void this.getQueueStats(false)
            this.showFullPackages = false
        }
    }

    /**
     * Redirect to the full deployments page using the Angular router.
     */
    headToFullDeployments() {
        void this.router.navigate([`/deploy-log`])
    }

    /**
     * Redirect to the live log. We aren’t using the router because this link
     * is dynamic, and I didn't find out how to make routerLinks external without
     * hardcoding them.
     */
    routeTo(liveLogUrl: string) {
        window.location.href = liveLogUrl ? liveLogUrl : ""
    }

    toggleLiveLog() {
        this.displayLiveLog = !this.displayLiveLog
        this.cdr.detectChanges()

        localStorage.setItem("displayLiveLog", this.displayLiveLog.toString())
    }
}
