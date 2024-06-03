import { Component } from "@angular/core";
import { Axios } from "axios";
import {
    CountNameObject,
    CountryRankList,
    PackageRankList,
    SpecificPackageMetrics,
    StatsObject,
    UserAgentList,
    UserAgentMetric,
} from "../types";
import { FormsModule } from "@angular/forms";

@Component({
    selector: "app-package-stats",
    standalone: true,
    imports: [FormsModule],
    templateUrl: "./package-stats.component.html",
    styleUrl: "./package-stats.component.css",
})
export class PackageStatsComponent {
    lastUpdated: string;
    protected axios: Axios;
    protected apiUrl = "http://metrics.chaotic.local:8080/";
    usersMetrics: number = 0;
    userAgentMetrics: UserAgentList = [];
    specificPackageMetrics: SpecificPackageMetrics = {};
    specificMetricsLoading: boolean = false;
    countryRanks: CountryRankList = [];
    countryRankRange: number = 30;
    packageMetricRange: number = 30;
    globalPackageMetrics: any;
    loading: boolean = true;
    searchPackage: string = "";

    constructor() {
        this.lastUpdated = "Stats are currently loading...";
        this.axios = new Axios({
            baseURL: this.apiUrl,
            timeout: 100000,
        });
    }

    // eslint-disable-next-line @angular-eslint/use-lifecycle-interface
    private async ngAfterViewInit(): Promise<void> {
        await this.updateAllMetrics();
    }

    /**
     * Update all metrics on the page.
     */
    async updateAllMetrics() {
        console.log("Loading stats...");
        this.loading = true;
        Promise.all([
            this.get30DayUsers(),
            this.get30DayUserAgents(),
            this.getOverallPackageMetrics(),
            this.getCountryRanks(),
        ])
            .then((allStats) => {
                this.usersMetrics = allStats[0];
                this.userAgentMetrics = allStats[1];
                this.globalPackageMetrics = allStats[2];
                this.countryRanks = allStats[3];
                this.lastUpdated = new Date().toLocaleString("en-GB", { timeZone: "UTC" });
                this.loading = false;
                console.log("Stats loaded.");
            })
            .catch((err) => {
                console.error(err);
            });
    }

    async getCurrentTraffic(): Promise<void> {}

    /**
     * Query the number of users in the last 30 days.
     * @returns The number of users in the last 30 days.
     */
    async get30DayUsers(): Promise<number> {
        return this.axios
            .get("30d/users")
            .then((response) => {
                return response.data;
            })
            .catch((err) => {
                console.error(err);
            });
    }

    /**
     * Query the number of user agents in the last 30 days.
     * @returns The number of user agents in the last 30 days.
     */
    async get30DayUserAgents(): Promise<UserAgentList> {
        return this.axios
            .get("30d/user-agents")
            .then((response) => {
                return this.parseOutput(response.data);
            })
            .catch((err) => {
                console.error(err);
                return [];
            });
    }

    /**
     * Parse the output of the non-single line metrics.
     * @param input The input to parse, usually text consisting of number, multiple whitespaces and a name.
     * @returns An array of objects containing the name and count of the metric.
     * @private
     */
    private parseOutput(input: string): any[] {
        const returningArray: UserAgentList | CountNameObject = [];
        const perLine = input.split("\n");
        for (const line of perLine) {
            const count = parseInt(line.split(/ (.*)/)[0]);
            const name = line.replace(/^[0-9]*\s/, "");
            if (!isNaN(count)) {
                returningArray.push({
                    name: name ?? "Unknown",
                    count,
                });
            }
        }
        return returningArray;
    }

    /**
     * Query the metrics for a specific package.
     */
    getSpecificPackageMetrics(): void {
        this.specificMetricsLoading = true;
        const specificMetrics: SpecificPackageMetrics = {};
        specificMetrics.name = this.searchPackage;
        Promise.all([
            this.axios.get(`30d/package/${specificMetrics.name}`),
            this.axios.get(`30d/package/${specificMetrics.name}/user-agents`),
        ])
            .then((allMetrics) => {
                specificMetrics.downloads = allMetrics[0].data;
                specificMetrics.user_agents = this.parseOutput(allMetrics[1].data);
            })
            .catch((err) => {
                console.error(err);
            });
        this.specificPackageMetrics = specificMetrics;
        this.specificMetricsLoading = false;
    }

    /**
     * Query the overall package metrics.
     * @returns The package ranking list.
     */
    async getOverallPackageMetrics(): Promise<PackageRankList> {
        return this.axios
            .get(`30d/rank/${this.packageMetricRange}/packages`)
            .then((response) => {
                return this.parseOutput(response.data);
            })
            .catch((err) => {
                console.error(err);
                return [];
            });
    }

    /**
     * Query the country ranks.
     * @returns The country ranking list.
     */
    async getCountryRanks(): Promise<CountryRankList> {
        return this.axios
            .get(`30d/rank/${this.countryRankRange}/countries`)
            .then((response) => {
                return this.parseOutput(response.data);
            })
            .catch((err) => {
                console.error(err);
                return [];
            });
    }
}
