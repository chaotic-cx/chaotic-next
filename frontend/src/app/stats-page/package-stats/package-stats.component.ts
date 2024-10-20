import { type PackageRankList } from "@./shared-lib"
import { DatePipe } from "@angular/common"
import { type AfterViewInit, Component } from "@angular/core"
import { AppService } from "../../app.service"

@Component({
    selector: "app-package-stats",
    standalone: true,
    imports: [DatePipe],
    templateUrl: "./package-stats.component.html",
    styleUrl: "./package-stats.component.css",
})
export class PackageStatsComponent implements AfterViewInit {
    packageMetricRange = 30
    globalPackageMetrics: PackageRankList = []
    loading = true
    lastUpdated: Date | string

    constructor(private appService: AppService) {
        this.lastUpdated = "Stats are currently loading..."
    }

    ngAfterViewInit(): void {
        void this.updateOverallMetrics()
    }

    /**
     * Query the overall package metrics.
     */
    async updateOverallMetrics(): Promise<void> {
        this.loading = true
        this.appService.getOverallPackageStats(this.packageMetricRange).subscribe({
            next: (data) => {
                this.globalPackageMetrics = data
                this.loading = false
                this.lastUpdated = new Date()
            },
            error: (err) => {
                console.error(err)
                return []
            },
        })
    }
}
