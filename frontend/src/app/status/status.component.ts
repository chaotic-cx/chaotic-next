import { CAUR_API_URL, type CurrentQueue, type StatsObject } from "@./shared-lib"
import { AfterViewInit, Component } from "@angular/core"
import { Router } from "@angular/router"
import { Axios } from "axios"
import { DeployLogComponent } from "../deploy-log/deploy-log.component"

@Component({
    selector: "app-status",
    standalone: true,
    imports: [DeployLogComponent],
    templateUrl: "./status.component.html",
    styleUrl: "./status.component.css",
})
export class StatusComponent implements AfterViewInit {
    currentQueue: CurrentQueue = []
    fullLength = 0
    lastUpdated: string | undefined
    loading = true
    showFullPackages = false
    nothingGoingOn = false
    Object = Object

    constructor(private router: Router) {}

    ngAfterViewInit(): void {
        void this.getQueueStats()
    }

    /*
     * Get the current queue stats from the Chaotic backend
     */
    async getQueueStats(): Promise<void> {
        this.loading = true
        this.lastUpdated = undefined
        const returnQueue: CurrentQueue = []

        const axios = new Axios({
            baseURL: CAUR_API_URL,
            timeout: 10000,
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
                                liveLogUrl: liveLogUrl,
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
                                build_class: build_class,
                            })
                            break
                        case "idle":
                            returnQueue.push({
                                status: "idle",
                                count: currentQueue.idle.count,
                                nodes: currentQueue.idle.nodes.map((node) => node.name),
                                build_class: currentQueue.idle.nodes.map((node) => node.build_class),
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
                    timeZone: "UTC",
                })

                this.nothingGoingOn = returnQueue.length === 0
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
            void this.getQueueStats()
            this.showFullPackages = true
        } else {
            void this.getQueueStats()
            this.showFullPackages = false
        }
    }

    /**
     * Redirect to the full deployments page using the Angular router.
     */
    headToFullDeployments() {
        void this.router.navigate([`/deploy-log`])
    }

    routeTo(liveLogUrl: string) {
        window.location.href = liveLogUrl ? liveLogUrl : ""
    }
}
