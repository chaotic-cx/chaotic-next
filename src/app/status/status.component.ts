import { Component } from "@angular/core";
import { Axios } from "axios";

@Component({
    selector: "app-status",
    standalone: true,
    imports: [],
    templateUrl: "./status.component.html",
    styleUrl: "./status.component.css",
})
export class StatusComponent {
    currentQueue: any[] = [];
    currentMetrics = {
        database_queue: {
            completed: 0,
            failed: 0,
        },
        builder_queue: {
            completed: 0,
            failed: 0,
        },
    };
    lastUpdated: string;
    axios: Axios;
    apiUrl = "https://builds.garudalinux.org/api/";

    constructor() {
        this.axios = new Axios({
            baseURL: this.apiUrl,
            timeout: 1000,
        });
        this.lastUpdated = new Date().toLocaleString("en-GB", { timeZone: "UTC" });
        void this.updateAll();
    }

    async getQueueStats(): Promise<void> {
        this.axios
            .get("queue/stats")
            .then((response) => {
                const waiting = { waiting: { count: 1, packages: ["test1", "test2]", "test3"] } };
                const currentQueue = [];
                currentQueue.push(waiting);
                console.log("currentQueue", currentQueue);
                console.log("length", currentQueue.length);
                if (currentQueue.length > 0) {
                    for (const index in currentQueue) {
                        console.log("queue", index);
                        this.currentQueue.push({
                            status: Object.keys(currentQueue[index])[0],
                            count: Object.values(currentQueue[index])[0].count,
                            packages: Object.values(currentQueue[index])[0].packages,
                        });
                    }
                }
                console.log(this.currentQueue);
            })
            .catch((error: any) => {
                console.error(error);
            });
    }

    async updateAll(): Promise<void> {
        await this.getMetrics();
        await this.getQueueStats();
        this.lastUpdated = new Date().toLocaleString("en-GB", { timeZone: "UTC" });
    }

    async getMetrics(): Promise<void> {
        this.axios
            .get("queue/metrics")
            .then((response) => {
                this.currentMetrics = JSON.parse(response.data);
            })
            .catch((error: any) => {
                console.error(error);
            });
    }
}
