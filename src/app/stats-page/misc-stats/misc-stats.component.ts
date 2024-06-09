import { Component } from "@angular/core"
import { Axios } from "axios"
import { CAUR_METRICS_URL, CountryRankList, UserAgentList } from "../../types"
import { getNow } from "../../utils/utils"

@Component({
    selector: "app-misc-stats",
    standalone: true,
    imports: [],
    templateUrl: "./misc-stats.component.html",
    styleUrl: "./misc-stats.component.css",
})
export class MiscStatsComponent {
    loading: boolean = true
    lastUpdated = "Stats are currently loading..."
    userAgentMetrics: UserAgentList = []
    countryRanks: CountryRankList = []
    countryRankRange: number = 30
    protected axios: Axios

    constructor() {
        this.axios = new Axios({
            baseURL: CAUR_METRICS_URL,
            timeout: 100000,
        })
    }

    ngAfterViewInit(): void {
        this.updateAllMetrics()
    }

    /**
     * Update all metrics and sets the values of the user agent metrics and country ranks.
     */
    updateAllMetrics(): void {
        Promise.all([this.get30DayUserAgents(), this.getCountryRanks()]).then((values) => {
            this.userAgentMetrics = values[0]
            this.countryRanks = values[1]
            this.loading = false
            this.lastUpdated = getNow()
        })
    }

    /**
     * Query the number of user agents in the last 30 days.
     * @returns The number of user agents in the last 30 days.
     */
    private async get30DayUserAgents(): Promise<UserAgentList> {
        return this.axios
            .get("30d/user-agents")
            .then((response) => {
                // We don't want to display >30 user agents
                const rightAmount = JSON.parse(response.data).slice(0, 30)
                // and also not too long user agent strings as that breaks visuals
                for (const entry of rightAmount) {
                    if (entry.name.length > 50) {
                        entry.name = entry.name.substring(0, 50) + "..."
                    }
                }
                return rightAmount
            })
            .catch((err) => {
                console.error(err)
                return []
            })
    }

    /**
     * Query the country ranks.
     * @returns The country ranking list.
     */
    private async getCountryRanks(): Promise<CountryRankList> {
        return this.axios
            .get(`30d/rank/30/countries`)
            .then((response) => {
                const jsonParsed: CountryRankList = JSON.parse(response.data)
                for (const country of jsonParsed) {
                    country.name = `${country.name}  ${this.countryCode2Flag(country.name)}`
                }
                return jsonParsed
            })
            .catch((err) => {
                console.error(err)
                return []
            })
    }

    /**
     * Transform a country code to a flag emoji.
     * Seen here: https://dev.to/jorik/country-code-to-flag-emoji-a21
     * @returns The corresponding flag as emoji.
     */
    private countryCode2Flag(countryCode: string): string {
        const codePoints = countryCode
            .toUpperCase()
            .split("")
            // @ts-ignore
            .map((char) => 127397 + char.charCodeAt())
        return String.fromCodePoint(...codePoints)
    }
}
