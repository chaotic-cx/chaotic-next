import { Component } from "@angular/core"
import { FormsModule } from "@angular/forms"
import { DeploymentList, DeploymentType } from "../types"
import { getDeployments, parseDeployments } from "../utils/utils"

@Component({
    selector: "app-deploy-log-full",
    standalone: true,
    imports: [FormsModule],
    templateUrl: "./deploy-log-full.component.html",
    styleUrl: "./deploy-log-full.component.css",
})
export class DeployLogFullComponent {
    latestDeployments: DeploymentList = []
    latestDeploymentStrings: string[] = []
    logAmount: number | undefined
    requestedTooMany = false
    currentType = DeploymentType.ALL

    async ngAfterViewInit(): Promise<void> {
        void this.updateLogAmount(50)
    }

    async updateLogAmount(amount: number) {
        switch (this.currentType) {
            case DeploymentType.ALL:
                this.latestDeployments = parseDeployments(
                    await getDeployments(amount, this.currentType),
                    this.currentType,
                )
                break
            case DeploymentType.SUCCESS:
                this.latestDeployments = parseDeployments(
                    await getDeployments(amount, this.currentType),
                    this.currentType,
                )
                break
            case DeploymentType.FAILED:
                this.latestDeployments = parseDeployments(
                    await getDeployments(amount, this.currentType),
                    this.currentType,
                )
                break
        }
        // Show if we requested too many deployments
        if (this.latestDeployments.length < amount) {
            this.requestedTooMany = true
        } else {
            this.requestedTooMany = false
        }

        this.constructStrings()
    }

    async getNewAmount(): Promise<void> {
        if (this.logAmount !== undefined) {
            // @ts-ignore
            if (/^[0-9]*$/.test(this.logAmount)) {
                await this.updateLogAmount(this.logAmount)
            } else {
                alert("Please enter a valid number")
            }
        }
    }

    /**
     * Construct strings to show in the UI for all currently loaded deployments.
     */
    constructStrings(): void {
        for (const index in this.latestDeployments) {
            if (this.latestDeployments[index].type === DeploymentType.SUCCESS) {
                this.latestDeployments[index].string = `Deployed`
            } else if (this.latestDeployments[index].type === DeploymentType.FAILED) {
                this.latestDeployments[index].string = `Failed deploying`
            } else {
                this.latestDeployments[index].string = `Unknown status of deployment`
            }
        }
    }
}
