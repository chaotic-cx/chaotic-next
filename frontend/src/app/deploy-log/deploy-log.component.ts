import {
    CACHE_TELEGRAM_TTL,
    DeploymentList,
    DeploymentType,
    getDeployments,
    parseDeployments,
    startShortPolling,
} from "@./shared-lib"
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

        // Poll for new deployments every 5 minutes (which is the time the backend caches requests)
        startShortPolling(CACHE_TELEGRAM_TTL, async () => {
            await this.checkNewDeployments()
        })
    }

    /**
     * Check for new deployments and update the list.
     */
    async checkNewDeployments(): Promise<void> {
        const newList: DeploymentList = parseDeployments(
            await getDeployments(30, DeploymentType.SUCCESS),
            DeploymentType.SUCCESS,
        )
        if (newList[0].date !== this.latestDeployments[0].date) {
            this.latestDeployments = newList
        }
    }
}
