import { Component } from "@angular/core"
import { Axios } from "axios"
import { DeployLogComponent } from "../deploy-log/deploy-log.component"
import { CAUR_API_URL, CurrentPackages, CurrentQueue, PackagesObject, StatsObject } from "../types"

@Component({
    selector: "app-status",
    standalone: true,
    imports: [DeployLogComponent],
    templateUrl: "./status.component.html",
    styleUrl: "./status.component.css",
})
export class StatusComponent {
    currentPackages: CurrentPackages = []
    currentQueue: CurrentQueue = []
    currentMetrics = {
        database_queue: {
            completed: 0,
            failed: 0,
        },
        builder_queue: {
            completed: 0,
            failed: 0,
        },
    }
    lastUpdated: string
    axios: Axios

    constructor() {
        this.axios = new Axios({
            baseURL: CAUR_API_URL,
            timeout: 1000,
        })
        this.lastUpdated = new Date().toLocaleString("en-GB", { timeZone: "UTC" })
        void this.updateAll()
    }

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
                        this.currentQueue.push({
                            status: Object.keys(currentQueue[index])[0],
                            count: Object.values(currentQueue[index])[0].count,
                            packages: nameWithoutRepo,
                        })
                    }
                }
            })
            .catch((error: any) => {
                console.error(error)
            })
    }

    async getPackageStats(): Promise<void> {
        this.axios
            .get("queue/packages")
            .then((response) => {
                const currentPackages: PackagesObject = JSON.parse(response.data)
                if (currentPackages.length > 0) {
                    for (const index in currentPackages) {
                        const pkgTime = new Date(Object.values(currentPackages[index])[0].timestamp).toLocaleString(
                            "en-GB",
                            { timeZone: "UTC" },
                        )
                        this.currentPackages.push({
                            name: Object.keys(currentPackages[index])[0],
                            arch: Object.values(currentPackages[index])[0].arch,
                            srcrepo: Object.values(currentPackages[index])[0].srcrepo,
                            time: pkgTime,
                        })
                    }
                }
            })
            .catch((error: any) => {
                console.error(error)
            })
    }

    async updateAll(): Promise<void> {
        await this.getMetrics()
        await this.getQueueStats()
        await this.getPackageStats()
        this.lastUpdated = new Date().toLocaleString("en-GB", { timeZone: "UTC" })
    }

    async getMetrics(): Promise<void> {
        this.axios
            .get("queue/metrics")
            .then((response) => {
                this.currentMetrics = JSON.parse(response.data)
            })
            .catch((error: any) => {
                console.error(error)
            })
    }
}
