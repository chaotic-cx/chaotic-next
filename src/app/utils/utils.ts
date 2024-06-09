import { Axios } from "axios"
import TimeAgo from "javascript-time-ago"
import { CAUR_TG_API_URL, CountNameObject, DeploymentList, TgMessageList, UserAgentList } from "../types"

/**
 * Parse the output of the non-single line metrics.
 * @param input The input to parse, usually text consisting of number, multiple whitespaces and a name.
 * @returns An array of objects containing the name and count of the metric.
 */
export function parseOutput(input: string): any[] {
    const returningArray: UserAgentList | CountNameObject = []
    const perLine = input.split("\n")
    for (const line of perLine) {
        const count = parseInt(line.split(/ (.*)/)[0])
        const name = line.replace(/^[0-9]*\s/, "")
        if (!isNaN(count)) {
            returningArray.push({
                name: name ?? "Unknown",
                count,
            })
        }
    }
    return returningArray
}

/**
 * Get the current date and time in a human-readable format.
 */
export function getNow(): string {
    return new Date().toLocaleString("en-GB", { timeZone: "UTC" })
}

/**
 * Check if the user is on a mobile device.
 * https://dev.to/timhuang/a-simple-way-to-detect-if-browser-is-on-a-mobile-device-with-javascript-44j3
 * @returns True if the user is on a mobile device, false otherwise.
 */
export function checkIfMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

/**
 * Parse the Telegram messages to make it usable for the website.
 * @param messages The TgMessageList array to parse.
 * @returns The parsed DeploymentList array.
 */
export function parseTgMessage(messages: TgMessageList): DeploymentList {
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

/**
 * Get the latest news from the Telegram channel.
 * @returns The latest news as a list of TgMessage.
 */
export async function getDeployments(amount: number): Promise<TgMessageList> {
    const axios = new Axios({
        baseURL: CAUR_TG_API_URL,
        timeout: 1000,
    })

    return axios
        .get(`deployments/${amount}`)
        .then((response) => {
            return JSON.parse(response.data)
        })
        .catch((err) => {
            console.error(err)
        })
}
