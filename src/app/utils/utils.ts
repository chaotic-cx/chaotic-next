/**
 * Parse the output of the non-single line metrics.
 * @param input The input to parse, usually text consisting of number, multiple whitespaces and a name.
 * @returns An array of objects containing the name and count of the metric.
 * @private
 */
import { CountNameObject, UserAgentList } from "../types"

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

export function getNow(): string {
    return new Date().toLocaleString("en-GB", { timeZone: "UTC" })
}

/**
 * Check if the user is on a mobile device.
 * https://dev.to/timhuang/a-simple-way-to-detect-if-browser-is-on-a-mobile-device-with-javascript-44j3
 * @returns True if the user is on a mobile device, false otherwise.
 * @private
 */
export function checkIfMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}
