import { Component } from "@angular/core"
import { FormsModule } from "@angular/forms"
import { Axios } from "axios"
import { CAUR_METRICS_URL, SpecificPackageMetrics } from "../../types"

@Component({
    selector: "app-package-search",
    standalone: true,
    imports: [FormsModule],
    templateUrl: "./package-search.component.html",
    styleUrl: "./package-search.component.css",
})
export class PackageSearchComponent {
    packageMetrics: SpecificPackageMetrics = { downloads: 0, user_agents: [] }
    loading: boolean = false
    searchPackage: string = ""
    initialSearchDone: boolean = false
    protected axios: Axios

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
        return await this.axios
            .get(`30d/package/${this.searchPackage}`)
            .then((response) => {
                return JSON.parse(response.data)
            })
            .catch((err) => {
                console.error(err)
                return []
            })
    }
}
