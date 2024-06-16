import { CAUR_API_URL, CurrentQueue, StatsObject } from "@./shared-lib"
import { Component } from "@angular/core"
import { Axios } from "axios"
import { DeployLogComponent } from "../deploy-log/deploy-log.component"

@Component({
    selector: "app-status",
    standalone: true,
    imports: [DeployLogComponent],
    templateUrl: "./status.component.html",
    styleUrl: "./status.component.css",
})
export class StatusComponent {
    axios: Axios
    currentQueue: CurrentQueue = []
    fullLength = 0
    fullQueue: CurrentQueue = []
    lastUpdated = "loading ... ☕️"
    showFullPackages = false

    constructor() {
        this.axios = new Axios({
            baseURL: CAUR_API_URL,
            timeout: 5000,
        })
        void this.updateAll()
    }

    /*
     * Get the current queue stats from the Chaotic backend
     */
    async getQueueStats(): Promise<void> {
        this.axios
            .get("queue/stats")
            .then((response) => {
                const currentQueue: StatsObject = JSON.parse(response.data)
                if (currentQueue.length > 0) {
                    for (const index in currentQueue) {
                        const nameWithoutRepo: string[] = []
                        Object.values(currentQueue[index])[0].packages.forEach((pkg): void => {
                            if (pkg !== undefined) {
                                nameWithoutRepo.push(pkg.split("/")[1])
                            }
                        })
                        this.fullQueue.push({
                            status: Object.keys(currentQueue[index])[0],
                            count: Object.values(currentQueue[index])[0].count,
                            packages: nameWithoutRepo,
                        })
                    }
                }
            })
            .catch((err) => {
                console.error(err)
            })
    }

    /**
     * Update all stats while ensuring the list of packages is not too huge.
     */
    async updateAll(): Promise<void> {
        await this.getQueueStats()
        this.lastUpdated = new Date().toLocaleString("en-GB", { timeZone: "UTC" })

        // Create a non-referenced copy of the full list. This can likely be done better.
        this.currentQueue = JSON.parse(JSON.stringify(this.fullQueue))
        this.fullQueue.forEach((item) => (this.fullLength += item.count))

        // If the full list is too long, shorten it.
        if (this.fullLength !== undefined && this.fullLength >= 50) {
            this.currentQueue.forEach((queue) => {
                if (queue.packages.length > 50) {
                    queue.packages.splice(49)
                    queue.packages.push("...")
                }
            })
        }
    }

    /**
     * Redirect to the full deployment log.
     */
    headToFullDeployments(): void {
        window.location.href = "./deploy-log"
    }

    /**
     * Replace currentList with fullList. For people who want to display the full list.
     */
    async showFullList(): Promise<void> {
        // Create a non-referenced copy of the full list. This can likely be done better.
        if (!this.showFullPackages) {
            this.currentQueue = JSON.parse(JSON.stringify(this.fullQueue))
            this.showFullPackages = true
        } else {
            await this.updateAll()
            this.showFullPackages = false
        }
    }
}
