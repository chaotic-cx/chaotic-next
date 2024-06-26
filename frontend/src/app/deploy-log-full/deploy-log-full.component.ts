import { DeploymentList, DeploymentType, getDeployments, parseDeployments } from "@./shared-lib"
import { AfterViewInit, Component } from "@angular/core"
import { FormsModule } from "@angular/forms"

@Component({
    selector: "app-deploy-log-full",
    standalone: true,
    imports: [FormsModule],
    templateUrl: "./deploy-log-full.component.html",
    styleUrl: "./deploy-log-full.component.css",
})
export class DeployLogFullComponent implements AfterViewInit {
    latestDeployments: DeploymentList = []
    logAmount: number | undefined
    requestedTooMany = false
    currentType: DeploymentType = DeploymentType.ALL

    async ngAfterViewInit(): Promise<void> {
        void this.updateLogAmount(50)
    }

    async updateLogAmount(amount: number) {
        this.latestDeployments = parseDeployments(await getDeployments(amount, this.currentType), this.currentType)

        // Show if we requested too many deployments
        this.requestedTooMany = this.latestDeployments.length < amount
        this.constructStrings()
    }

    /**
     * Check for whether input is a valid number.
     */
    async getNewAmount(): Promise<void> {
        if (this.logAmount !== undefined) {
            // @ts-ignore
            if (/^[0-9]*$/.test(this.logAmount)) {
                await this.updateLogAmount(this.logAmount)
            } else {
                alert("Please enter a valid number")
            }
        } else {
            await this.updateLogAmount(50)
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
                    this.latestDeployments[index].string = `Timed out during deployment of`
                    break
                case DeploymentType.CLEANUP:
                    this.latestDeployments[index].string = `Cleanup job ran for`
                    break
                default:
                    this.latestDeployments[index].string = `Unknown status for`
                    break
            }
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
    }
}
