import type { CountNameObject, UserAgentList } from "@./shared-lib";
import type { ConfigService } from "@nestjs/config";

/**
 * Parse the output of the non-single line metrics.
 * @param input The input to parse, usually text consisting of number, multiple whitespaces, and a name.
 * @returns An array of objects containing the name and count of the metric.
 */
export function parseOutput(input: string): { name: string; count: number }[] {
    const returningArray: UserAgentList | CountNameObject = []
    const perLine = input.split("\n")
    for (const line of perLine) {
        const count = Number.parseInt(line.split(/ (.*)/)[0])
        const name = line.replace(/^[0-9]*\s/, "")
        if (!Number.isNaN(count)) {
            returningArray.push({
                name: name ?? "Unknown",
                count,
            })
        }
    }
    return returningArray
}

/**
 * Generate a node id for the moleculer broker.
 * @returns A string containing the node id and a random string.
 */
export function generateNodeId(): string {
    // This prevents broker shutdowns due to double ids in case we have overlapping nodeIds.
    const randomString = Math.random().toString(36).substring(2, 7);

    if (process.env.HOSTNAME) return `${process.env.HOSTNAME}-${randomString}`;
    return `backend-${randomString}`;
}


export function checkEnvironment(configService: ConfigService) {
    const requiredEnvVars: string[] = [
        'CAUR_PORT',
    ];

    for (const envVar of requiredEnvVars) {
        if (!configService.get<string>(envVar)) {
            throw Error(`Undefined environment variable: ${envVar}`);
        }
    }
}
