import { Component } from "@angular/core"
import { FormsModule } from "@angular/forms"
import TimeAgo from "javascript-time-ago"
import en from "javascript-time-ago/locale/en"
import { DeploymentList } from "../types"
import { getDeployments, parseTgMessage } from "../utils/utils"

@Component({
    selector: "app-deploy-log-full",
    standalone: true,
    imports: [FormsModule],
    templateUrl: "./deploy-log-full.component.html",
    styleUrl: "./deploy-log-full.component.css",
})
export class DeployLogFullComponent {
    latestDeployments: DeploymentList = []
    logAmount: number | undefined

    constructor() {
        TimeAgo.addDefaultLocale(en)
    }

    async ngAfterViewInit(): Promise<void> {
        void this.updateLogAmount(100)
    }

    async updateLogAmount(amount: number) {
        this.latestDeployments = parseTgMessage(await getDeployments(amount + 1))
    }

    async getNewAmount(): Promise<void> {
        // @ts-ignore
        void this.updateLogAmount(parseInt(this.logAmount))
    }
}
