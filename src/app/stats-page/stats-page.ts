import { Component } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { PackageSearchComponent } from "./package-search/package-search.component";
import { PackageStatsComponent } from "./package-stats/package-stats.component";
import { MiscStatsComponent } from "./misc-stats/misc-stats.component";
import { Axios } from "axios";
import { routes } from "../app.routes";
import { RouterLink, RouterLinkActive } from "@angular/router";

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
export class StatsPage {
    currentView: string = "search";
    total30dUsers: string = "0";
    protected axios: Axios;
    protected apiUrl = "https://metrics.chaotic.cx/";

    constructor() {
        this.axios = new Axios({
            baseURL: this.apiUrl,
            timeout: 100000,
        });
    }

    ngAfterViewInit(): void {
        void this.get30DayUsers();
    }

    /**
     * Change the display view to the value of the clicked button.
     * @param event
     */
    changeDisplay(event: any) {
        this.currentView = event.srcElement.id.split("-")[1];
        // routes.navigate([`stats/${this.currentView}`]);
    }

    /**
     * Get total users count.
     * @returns The total users count as string.
     */
    async get30DayUsers(): Promise<string> {
        return this.axios
            .get("30d/users")
            .then((response) => {
                return response.data;
            })
            .catch((err) => {
                console.error(err);
                return "0";
            });
    }
}
