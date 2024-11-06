import type { CountNameObject, UserAgentList } from "@./shared-lib";
import type { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { requiredEnvVarsDev, requiredEnvVarsProd } from "./constants";
import { BumpType } from "./interfaces/repo-manager";

/**
 * Parse the output of the non-single line metrics.
 * @param input The input to parse, usually text consisting of number, multiple whitespaces, and a name.
 * @returns An array of objects containing the name and count of the metric.
 */
export function parseOutput(input: string): { name: string; count: number }[] {
    const returningArray: UserAgentList | CountNameObject = [];
    const perLine = input.split("\n");
    for (const line of perLine) {
        const count = Number.parseInt(line.split(/ (.*)/)[0]);
        const name = line.replace(/^[0-9]*\s/, "");
        if (!Number.isNaN(count)) {
            returningArray.push({
                name: name ?? "Unknown",
                count,
            });
        }
    }
    return returningArray;
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

/**
 * Check if all required environment variables are set.
 * If not, throw an error.
 * @param configService The NestJs config service to check the environment variables with.
 */
export function checkEnvironment(configService: ConfigService): void {
    const required: string[] =
        configService.get<string>("NODE_ENV") === "development" ? requiredEnvVarsDev : requiredEnvVarsProd;
    const missingEnvVars: string[] = required.filter((envVar) => !configService.get<string>(envVar));

    if (missingEnvVars.length > 0) {
        throw new Error(`Missing environment variables: ${missingEnvVars.join(", ")}`);
    }
}

/**
 * Get the password hash for a given password and crypt key.
 * @param password The password to hash
 * @returns The hashed password
 */
export async function getPasswordHash(password: string): Promise<string> {
    const saltOrRounds = 10;
    return bcrypt.hash(password, saltOrRounds);
}

/**
 *  Get the number of days in the past.
 *  @param n The number of days to look back
 *  @returns The date n days in the past
 */
export function nDaysInPast(n: number): Date {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/**
 * Check if a given string is a valid URL.
 * @param url The URL to check
 * @returns True if the URL is valid, false otherwise
 */
export function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch (err: unknown) {
        return false;
    }
}

/**
 * Transform a BumpType from the BumpType enum to text.
 * @param type The BumpType to transform
 * @param phrase What kind of grammatical structure to use
 * @returns The BumpType as text
 */
export function bumpTypeToText(type: BumpType, phrase: 1 | 2 = 1): string {
    switch (type) {
        case BumpType.EXPLICIT:
            if (phrase === 2) return "explicit";
            return "explicitly";
        case BumpType.GLOBAL:
            if (phrase === 2) return "global";
            return "globally";
        case BumpType.FROM_DEPS:
            if (phrase === 2) return "Arch dependency";
            return "via Arch dependencies";
        case BumpType.FROM_DEPS_CHAOTIC:
            if (phrase === 2) return "Chaotic dependency";
            return "via Chaotic dependencies";
        default:
            return "Unknown";
    }
}
