import { CACHE_TELEGRAM_TTL, type DeploymentList, DeploymentType } from "@./shared-lib"
import { type AfterViewInit, ChangeDetectorRef, Component } from "@angular/core"
import { FormsModule } from "@angular/forms"
import { RouterLink } from "@angular/router"
import { generateRepoUrl, getDeployments, parseDeployments, startShortPolling } from "../functions"

@Component({
    selector: "app-deploy-log-full",
    standalone: true,
    imports: [FormsModule, RouterLink],
    templateUrl: "./deploy-log-full.component.html",
    styleUrl: "./deploy-log-full.component.css"
})
export class DeployLogFullComponent implements AfterViewInit {
    latestDeployments: DeploymentList = []
    shownDeployments: DeploymentList = []
    logAmount: number | undefined
    requestedTooMany = false
    currentType: DeploymentType = DeploymentType.ALL
    searchterm: string | undefined
    isFiltered = false

    constructor(private cdr: ChangeDetectorRef) {
    }

    async ngAfterViewInit(): Promise<void> {
        await this.updateLogAmount(50)
        void this.showDeployments()

        // Poll for new deployments every 30 seconds (which is the time the backend caches requests)
        startShortPolling(CACHE_TELEGRAM_TTL, async () => {
            await this.updateLogAmount(this.logAmount ?? 100)
            void this.showDeployments()
        })
    }

    /**
     * Update the list/number of deployments to show.
     * @param amount The number of deployments to request from the backend
     */
    async updateLogAmount(amount: number): Promise<void> {
        this.latestDeployments = parseDeployments(
            await getDeployments(amount, this.currentType),
            this.currentType
        )
        this.requestedTooMany = this.latestDeployments.length < amount

        // Parse the strings for the UI and write them to the list
        this.constructStrings()
        this.cdr.detectChanges()
    }

    /**
     * Check for whether input is a valid number.
     */
    async getNewAmount(): Promise<void> {
        if (this.logAmount !== undefined) {
            // @ts-ignore
            if (/^[0-9]*$/.test(this.logAmount)) {
                await this.updateLogAmount(this.logAmount)
                void this.showDeployments()
            } else {
                alert("Please enter a valid number")
            }
        } else {
            await this.updateLogAmount(100)
            void this.showDeployments()
        }
    }

    /**
     * Construct strings to show in the UI for all currently loaded deployments.
     */
    constructStrings(): void {
        for (const index in this.latestDeployments) {
            switch (this.latestDeployments[index].type) {
                case DeploymentType.SUCCESS:
                    this.latestDeployments[index].string = `Deployed`
                    break
                case DeploymentType.FAILED:
                    this.latestDeployments[index].string = `Failed deploying`
                    break
                case DeploymentType.TIMEOUT:
                    this.latestDeployments[index].string =
                        `Timed out during deployment of`
                    break
                case DeploymentType.CLEANUP:
                    this.latestDeployments[index].string = `Cleanup job ran for`
                    break
                default:
                    this.latestDeployments[index].string = `Unknown status for`
                    break
            }

            // Add source URL
            this.latestDeployments[index].sourceUrl = generateRepoUrl(this.latestDeployments[index])
        }
    }

    /**
     * Change the deployment type to query. Certainly not a very fancy way, but works for now.
     * @param $event
     */
    changeDeploymentType($event: Event): void {
        // @ts-ignore
        switch ($event.target.value) {
            case "0":
                this.currentType = DeploymentType.ALL
                break
            case "1":
                this.currentType = DeploymentType.SUCCESS
                break
            case "2":
                this.currentType = DeploymentType.FAILED
                break
            case "3":
                this.currentType = DeploymentType.TIMEOUT
                break
        }
        void this.getNewAmount()
    }

    /**
     * Show deployments based on the current search term (if any). Shows all deployments if no search term is present.
     */
    async showDeployments(): Promise<void> {
        const toFilter: DeploymentList = this.latestDeployments

        if (this.searchterm && this.searchterm !== "" && !this.isFiltered) {
            this.shownDeployments = toFilter.filter((deployment) => {
                return deployment.name
                    .toLowerCase()
                    .includes(this.searchterm?.toLowerCase() ?? "")
            })

            if (this.shownDeployments.length > 0) {
                return
            }

            // If we have no results, we need to fetch more
            let resultAmount = this.logAmount ? this.logAmount * 2 : 200
            while (this.shownDeployments.length === 0 || resultAmount > 2000) {
                await this.updateLogAmount(resultAmount)
                this.shownDeployments = toFilter.filter((deployment) => {
                    return deployment.name
                        .toLowerCase()
                        .includes(this.searchterm?.toLowerCase() ?? "")
                })
                resultAmount *= 2
            }
            this.isFiltered = true
        } else if (
            this.searchterm &&
            this.searchterm !== "" &&
            this.isFiltered
        ) {
            // We are already filtering, so we need it to filter the full list again
            this.shownDeployments = toFilter.filter((deployment) => {
                return deployment.name
                    .toLowerCase()
                    .includes(this.searchterm?.toLowerCase() ?? "")
            })
            this.isFiltered = false
        } else {
            // None of the previous cases applied, we need to show all logs
            this.shownDeployments = toFilter
        }
    }
}
