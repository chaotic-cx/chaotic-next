import {
    CAUR_CACHED_METRICS_URL,
    type PackageRankList,
    getNow,
} from "@./shared-lib"
import { type AfterViewInit, Component } from "@angular/core"
import { Axios } from "axios"

@Component({
    selector: "app-package-stats",
    standalone: true,
    imports: [],
    templateUrl: "./package-stats.component.html",
    styleUrl: "./package-stats.component.css",
})
export class PackageStatsComponent implements AfterViewInit {
    packageMetricRange = 30
    globalPackageMetrics: PackageRankList = []
    loading = true
    lastUpdated: string
    axios: Axios

    constructor() {
        this.lastUpdated = "Stats are currently loading..."
        this.axios = new Axios({
            baseURL: CAUR_CACHED_METRICS_URL,
            timeout: 100000,
        })
    }

    ngAfterViewInit(): void {
        this.updateOverallMetrics()
    }

    /**
     * Update all metrics on the page.
     */
    updateOverallMetrics(): void {
        this.loading = true
        this.getOverallPackageMetrics().then((result) => {
            this.globalPackageMetrics = result
            this.loading = false
            this.lastUpdated = getNow()
        })
    }

    /**
     * Query the overall package metrics.
     * @returns The package ranking list.
     */
    async getOverallPackageMetrics(): Promise<PackageRankList> {
        return this.axios
            .get(`30d/rank/${this.packageMetricRange}/packages`)
            .then((response) => {
                return JSON.parse(response.data)
            })
            .catch((err) => {
                console.error(err)
                return []
            })
    }
}
