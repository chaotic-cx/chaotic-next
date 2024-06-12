import { CAUR_CACHED_METRICS_URL, SpecificPackageMetrics } from "@./shared-lib"
import { Component } from "@angular/core"
import { FormsModule } from "@angular/forms"
import { Axios } from "axios"

@Component({
    selector: "app-package-search",
    standalone: true,
    imports: [FormsModule],
    templateUrl: "./package-search.component.html",
    styleUrl: "./package-search.component.css",
})
export class PackageSearchComponent {
    packageMetrics: SpecificPackageMetrics = { downloads: 0, user_agents: [] }
    loading = false
    searchPackage = ""
    initialSearchDone = false
    protected axios: Axios

    constructor() {
        this.axios = new Axios({
            baseURL: CAUR_CACHED_METRICS_URL,
            timeout: 100000,
        })
    }

    updateDisplay(): void {
        if (/^[0-9|a-zA-Z]*$/.test(this.searchPackage)) {
            this.loading = true
            this.getSpecificPackageMetrics().then((result) => {
                this.packageMetrics = result
                this.loading = false
                this.initialSearchDone = true
            })
        } else {
            alert("This does not look like a valid package name!")
        }
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
