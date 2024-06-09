import { Component } from "@angular/core"
import { FormsModule } from "@angular/forms"
import { RouterLink } from "@angular/router"
import TimeAgo from "javascript-time-ago"
import en from "javascript-time-ago/locale/en"
import { DeploymentList } from "../types"
import { getDeployments, parseTgMessage } from "../utils/utils"

@Component({
    selector: "app-deploy-log",
    standalone: true,
    imports: [RouterLink, FormsModule],
    templateUrl: "./deploy-log.component.html",
    styleUrl: "./deploy-log.component.css",
})
export class DeployLogComponent {
    latestDeployments: DeploymentList = []

    constructor() {
        TimeAgo.addDefaultLocale(en)
    }

    async ngAfterViewInit(): Promise<void> {
        this.latestDeployments = parseTgMessage(await getDeployments(30))
    }

    /**
     * Check for new deployments and update the list.
     */
    async checkNewDeployments(): Promise<void> {
        const newList = parseTgMessage(await getDeployments(30))
        if (newList.length !== this.latestDeployments.length) {
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
