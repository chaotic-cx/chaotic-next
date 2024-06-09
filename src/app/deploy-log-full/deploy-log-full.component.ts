import { Component } from "@angular/core"
import TimeAgo from "javascript-time-ago"
import en from "javascript-time-ago/locale/en"
import { DeploymentList } from "../types"
import { getDeployments, parseTgMessage } from "../utils/utils"

@Component({
    selector: "app-deploy-log-full",
    standalone: true,
    imports: [],
    templateUrl: "./deploy-log-full.component.html",
    styleUrl: "./deploy-log-full.component.css",
})
export class DeployLogFullComponent {
    latestDeployments: DeploymentList = []

    constructor() {
        TimeAgo.addDefaultLocale(en)
    }

    async ngAfterViewInit(): Promise<void> {
        this.latestDeployments = parseTgMessage(await getDeployments(100))
    }
}
