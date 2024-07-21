import { CAUR_API_URL, CurrentQueue, StatsObject } from "@./shared-lib"
import { AfterViewInit, Component } from "@angular/core"
import { Axios } from "axios"
import { DeployLogComponent } from "../deploy-log/deploy-log.component"
import { Router } from "@angular/router"

@Component({
    selector: "app-status",
    standalone: true,
    imports: [DeployLogComponent],
    templateUrl: "./status.component.html",
    styleUrl: "./status.component.css"
})
export class StatusComponent implements AfterViewInit {
    currentQueue: CurrentQueue = []
    fullLength = 0
    lastUpdated: string | undefined
    loading = true
    showFullPackages = false

    constructor(private router: Router) {
    }

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
            timeout: 10000
        })
        axios
            .get("queue/stats")
            .then((response) => {
                const currentQueue: StatsObject = JSON.parse(response.data)
                console.log(currentQueue)
                if (currentQueue.length > 0) {
                    for (const index in currentQueue) {
                        const nameWithoutRepo: string[] = []
                        Object.values(currentQueue[index])[0].packages.forEach((pkg): void => {
                            if (pkg !== undefined) {
                                nameWithoutRepo.push(pkg.split("/")[1])
                            }
                        })
                        returnQueue.push({
                            status: Object.keys(currentQueue[index])[0],
                            count: Object.values(currentQueue[index])[0].count,
                            packages: nameWithoutRepo
                        })
                    }
                }

                // Calculate the full length of the queue
                let length = 0
                returnQueue.forEach((queue) => {
                    length += queue.count
                })
                this.fullLength = length

                // If the full list is too long, shorten it.
                if (this.fullLength >= 50 && !this.showFullPackages) {
                    returnQueue.forEach((queue) => {
                        if (queue.packages.length > 50) {
                            queue.packages.splice(50)
                            queue.packages.push("...")
                        }
                    })
                }

                // Finally, update the component's state
                this.lastUpdated = new Date().toLocaleString("en-GB", { timeZone: "UTC" })
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
}
