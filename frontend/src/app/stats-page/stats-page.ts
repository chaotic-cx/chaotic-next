import { CAUR_CACHED_METRICS_URL } from "@./shared-lib"
import { Component, type OnInit } from "@angular/core"
import { FormsModule } from "@angular/forms"
import { RouterLink, RouterLinkActive } from "@angular/router"
import { Axios } from "axios"
import { MiscStatsComponent } from "./misc-stats/misc-stats.component"
import { PackageSearchComponent } from "./package-search/package-search.component"
import { PackageStatsComponent } from "./package-stats/package-stats.component"

@Component({
    selector: "app-stats-page",
    standalone: true,
    imports: [
        FormsModule,
        PackageSearchComponent,
        PackageStatsComponent,
        MiscStatsComponent,
        RouterLink,
        RouterLinkActive,
    ],
    templateUrl: "./stats-page.html",
    styleUrl: "./stats-page.css",
})
// eslint-disable-next-line @angular-eslint/component-class-suffix
export class StatsPage implements OnInit {
    currentView = "search"
    total30dUsers = "loading ... ☕️"

    async ngOnInit(): Promise<void> {
        this.total30dUsers = await this.get30DayUsers()
    }

    /**
     * Change the display view to the value of the clicked button.
     * @param event
     */
    changeDisplay(event: any) {
        this.currentView = event.target.id.split("-")[1]
    }

    /**
     * Get total users count.
     * @returns The total users count as string.
     */
    async get30DayUsers(): Promise<string> {
        const axios = new Axios({
            baseURL: CAUR_CACHED_METRICS_URL,
            timeout: 100000,
        })

        return axios
            .get("30d/users")
            .then((response) => {
                return response.data
            })
            .catch((err) => {
                console.error(err)
                return "failed to load users count 😔"
            })
    }
}
