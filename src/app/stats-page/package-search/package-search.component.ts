import { Component } from "@angular/core"
import { FormsModule } from "@angular/forms"
import { Axios } from "axios"
import { CAUR_METRICS_URL, SpecificPackageMetrics } from "../../types"
import { parseOutput } from "../../utils/utils"

@Component({
    selector: "app-package-search",
    standalone: true,
    imports: [FormsModule],
    templateUrl: "./package-search.component.html",
    styleUrl: "./package-search.component.css",
})
export class PackageSearchComponent {
    protected axios: Axios
    packageMetrics: SpecificPackageMetrics = { downloads: 0, user_agents: [] }
    loading: boolean = false
    searchPackage: string = ""
    initialSearchDone: boolean = false

    constructor() {
        this.axios = new Axios({
            baseURL: CAUR_METRICS_URL,
            timeout: 100000,
        })
    }

    updateDisplay(): void {
        this.loading = true
        this.getSpecificPackageMetrics().then((result) => {
            this.packageMetrics = result
            this.loading = false
            this.initialSearchDone = true
        })
    }

    /**
     * Query the metrics for a specific package.
     */
    async getSpecificPackageMetrics(): Promise<SpecificPackageMetrics> {
        const metrics: SpecificPackageMetrics = { downloads: 0, user_agents: [] }
        metrics.name = this.searchPackage
        return await Promise.all([
            this.axios.get(`30d/package/${metrics.name}`),
            this.axios.get(`30d/package/${metrics.name}/user-agents`),
        ])
            .then((allMetrics) => {
                metrics.downloads = allMetrics[0].data
                metrics.user_agents = parseOutput(allMetrics[1].data)
                return metrics
            })
            .catch((err) => {
                console.error(err)
                return metrics
            })
    }
}
