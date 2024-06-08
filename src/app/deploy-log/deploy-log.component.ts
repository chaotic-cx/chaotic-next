import { Component } from "@angular/core"
import { Axios } from "axios"
import TimeAgo from "javascript-time-ago"
import en from "javascript-time-ago/locale/en"
import { CAUR_TG_API_URL, DeploymentList, TgMessageList } from "../types"

@Component({
    selector: "app-deploy-log",
    standalone: true,
    imports: [],
    templateUrl: "./deploy-log.component.html",
    styleUrl: "./deploy-log.component.css",
})
export class DeployLogComponent {
    latestDeployments: DeploymentList = []

    async ngAfterViewInit(): Promise<void> {
        TimeAgo.addDefaultLocale(en)
        this.latestDeployments = this.parseTgMessage(await this.getDeployments())
    }

    /**
     * Get the latest news from the Telegram channel.
     * @returns The latest news as a list of TgMessage.
     */
    async getDeployments(): Promise<TgMessageList> {
        const axios = new Axios({
            baseURL: CAUR_TG_API_URL,
            timeout: 1000,
        })

        return axios
            .get("telegram/deployments")
            .then((response) => {
                return JSON.parse(response.data)
            })
            .catch((err) => {
                console.error(err)
            })
    }

    /**
     * Check for new deployments and update the list.
     */
    async checkNewDeployments(): Promise<void> {
        const newList = this.parseTgMessage(await this.getDeployments())
        if (newList.length !== this.latestDeployments.length) {
            this.latestDeployments = newList
        }
    }

    /**
     * Parse the Telegram messages to make it usable for the website.
     * @param messages The TgMessageList array to parse.
     * @returns The parsed DeploymentList array.
     * @private
     */
    private parseTgMessage(messages: TgMessageList): DeploymentList {
        const timeAgo = new TimeAgo("en-US")

        const deploymentList: DeploymentList = []
        for (const message of messages) {
            // No point in displaying failed deployment notifications
            if (!message.content.startsWith("📣")) {
                continue
            }
            const pkg = message.content.split("> ")[1]

            // The case was required to work around .split being undefined
            const repo = String(message.content.split("deployment to ")[1]).split(":")[0]

            // Generate passed time in a human-readable format
            const date = timeAgo.format(message.date * 1000, "round")
            deploymentList.push({
                date: date,
                name: pkg,
                repo: repo,
            })
        }
        return deploymentList
    }
}
