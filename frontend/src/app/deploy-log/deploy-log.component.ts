import { DeploymentList, DeploymentType, getDeployments, parseDeployments } from "@./shared-lib"
import { AfterViewInit, Component } from "@angular/core"
import { FormsModule } from "@angular/forms"
import { RouterLink } from "@angular/router"

@Component({
    selector: "app-deploy-log",
    standalone: true,
    imports: [RouterLink, FormsModule],
    templateUrl: "./deploy-log.component.html",
    styleUrl: "./deploy-log.component.css",
})
export class DeployLogComponent implements AfterViewInit {
    latestDeployments: DeploymentList = []

    async ngAfterViewInit(): Promise<void> {
        this.latestDeployments = parseDeployments(
            await getDeployments(30, DeploymentType.SUCCESS),
            DeploymentType.SUCCESS,
        )
    }

    /**
     * Check for new deployments and update the list.
     */
    async checkNewDeployments(): Promise<void> {
        const newList: DeploymentList = parseDeployments(
            await getDeployments(30, DeploymentType.SUCCESS),
            DeploymentType.SUCCESS,
        )
        if (newList !== this.latestDeployments) {
            this.latestDeployments = newList
        }
    }

    /**
     * Redirect to the full deployment log.
     */
    headToFullDeployments(): void {
        window.location.href = "./deploy-log"
    }
}
