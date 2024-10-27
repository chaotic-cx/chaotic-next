import {
    CAUR_LOGS_URL,
    CAUR_REPO_URL,
    CAUR_REPO_URL_GARUDA,
    CAUR_TG_API_URL,
    type Deployment,
    type DeploymentList,
    DeploymentType,
    type RepositoryList,
    type TgMessageList,
} from "@./shared-lib";
import { ElementRef, Renderer2 } from "@angular/core";
import { type CatppuccinFlavor, flavors } from "@catppuccin/palette";
import TimeAgo from "javascript-time-ago";
import { lastValueFrom } from "rxjs";
import { AppService } from "./app.service";

/**
 * Poll for new deployments.
 * @param interval
 * @param func The function to call.
 */
export function startShortPolling(interval: any, func: () => void): void {
    let initialInterval;
    interval = setInterval(func, interval);
    clearInterval(initialInterval);
}

/**
 * Loads the selected theme.
 * @param theme The theme to load (one of CatppuccinFlavor).
 * @param renderer The renderer to use.
 * @param el The element to apply the theme to.
 */
export function loadTheme(theme: string, renderer: Renderer2, el: ElementRef) {
    const appCtp = document.getElementById("app-ctp");
    if (appCtp === null) return;
    if (appCtp.classList.contains(theme)) {
        return theme;
    }

    appCtp.classList.remove("mocha", "latte", "frappe", "macchiato");
    appCtp.classList.add(theme);

    const flavor = theme as unknown as CatppuccinFlavor;
    // @ts-expect-error - this is always a valid color
    const flavorColor = flavors[flavor].colors.base.hex;
    renderer.setStyle(el.nativeElement.ownerDocument.body, "backgroundColor", flavorColor);
    return theme;
}

/**
 * Generate the URL for the repository.
 * @param deployment The deployment to generate the URL for.
 * @returns The URL for the repository, in which the PKGBUILD is located.
 */
export function generateRepoUrl(deployment: Deployment): string | undefined {
    if (deployment.repo.match(/chaotic-aur$/) !== null) {
        deployment.sourceUrl = CAUR_REPO_URL;
        return deployment.sourceUrl;
    }
    if (deployment.repo.match(/garuda$/) !== null) {
        deployment.sourceUrl = CAUR_REPO_URL_GARUDA;
        return deployment.sourceUrl;
    }
    return undefined;
}

/**
 * Get the current date and time in a human-readable format.
 */
export function getNow(): string {
    return new Date().toLocaleString("en-GB", { timeZone: "UTC" });
}

/**
 * Check if the user is on a mobile device.
 * https://dev.to/timhuang/a-simple-way-to-detect-if-browser-is-on-a-mobile-device-with-javascript-44j3
 * @returns True if the user is on a mobile device, false otherwise.
 */
export function checkIfMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Parse the Telegram messages to make it usable for the website.
 * @param messages The TgMessageList array to parse.
 * @param type The type of deployment to parse, e.g., all, failed, succeeded.
 * @returns The parsed DeploymentList array.
 */
export function parseDeployments(messages: TgMessageList, type: DeploymentType): DeploymentList {
    const timeAgo = new TimeAgo("en-US");
    const deploymentList: DeploymentList = [];

    for (const message of messages) {
        let pkg: string;
        let repo: string;
        let node: RegExpMatchArray | null | string = "unknown";
        let deploymentType: DeploymentType;
        const log = message.log;

        if (String(message.content).includes("Cleanup")) {
            pkg = "";
        } else {
            pkg = String(message.content).split("> ")[1].split(" - logs")[0];
        }

        const date = timeAgo.format(Number.parseInt(message.date) * 1000, "round");

        if (
            (type === DeploymentType.SUCCESS || type === DeploymentType.ALL) &&
            String(message.content).includes("deployment to")
        ) {
            const buildRepo = String(String(message.content).split("deployment to ")[1]);
            node = buildRepo.match(/on\s(.*)/) ? buildRepo.match(/on\s([\w-]*)/)![1] : "unknown";
            repo = buildRepo.split(" from")[0].split(" on")[0];
            deploymentType = DeploymentType.SUCCESS;
        } else if (
            (type === DeploymentType.TIMEOUT || type === DeploymentType.ALL) &&
            String(message.content).includes("timeout")
        ) {
            repo = String(message.content).split("Build for ")[1].split(" failed")[0];
            deploymentType = DeploymentType.TIMEOUT;
        } else if (
            (type === DeploymentType.FAILED || type === DeploymentType.ALL) &&
            String(message.content).includes("Failed")
        ) {
            const buildRepo = String(String(message.content).split("Failed deploying to ")[1]);
            node = buildRepo.match(/on\s(.*)/) ? buildRepo.match(/on\s([\w-]*)/)![1] : "unknown";
            repo = buildRepo.split(" on")[0];
            deploymentType = DeploymentType.FAILED;
        } else if (
            (type === DeploymentType.CLEANUP || type === DeploymentType.ALL) &&
            String(message.content).includes("Cleanup")
        ) {
            repo = String(message.content).split("Cleanup job for ")[1].split(" ")[0];
            deploymentType = DeploymentType.CLEANUP;
        } else {
            continue;
        }

        deploymentList.push({
            date: date,
            name: pkg,
            repo: repo,
            type: deploymentType,
            log: log ? toLiveLog(log.split(":")[1]) : undefined,
            node: node,
        });
    }
    return deploymentList;
}

/**
 * Get the latest news from the Telegram channel.
 * @returns The latest news as a list of TgMessage.
 */
export async function getDeployments(
    amount: number,
    type: DeploymentType,
    appService: AppService,
    repo: RepositoryList,
): Promise<TgMessageList> {
    let requestString: string;
    switch (type as DeploymentType) {
        case DeploymentType.ALL:
            requestString = "all";
            break;
        case DeploymentType.FAILED:
            requestString = "failed";
            break;
        case DeploymentType.SUCCESS:
            requestString = "succeeded";
            break;
        case DeploymentType.TIMEOUT:
            requestString = "timeout";
            break;
        case DeploymentType.CLEANUP:
            requestString = "cleanup";
            break;
    }

    const url = `${CAUR_TG_API_URL}/deployments/${requestString}/${amount}`;
    return lastValueFrom(appService.getDeployments(url, repo));
}

/**
 * Parses a static log URL to a live log URL.
 * From: /logs/api/logs/strawberry-git/1728221997487
 * To: /logs/logs.html?timestamp=1728139106459&id=kodi-git
 * @param url The static log URL.
 * @returns The live log URL.
 */
export function toLiveLog(url: string): string {
    const splitUrl = url.split("/");
    const timestamp = splitUrl.pop();
    const id = splitUrl.pop();

    let finalUrl = CAUR_LOGS_URL;
    if (timestamp !== undefined) {
        finalUrl += `?timestamp=${timestamp}`;
    }
    if (id !== undefined && timestamp !== undefined) {
        finalUrl += `&id=${id}`;
    } else if (id !== undefined) {
        finalUrl += `?id=${id}`;
    }
    return finalUrl;
}

export function entityToHtml(ctx: any) {
    const text = ctx.msg?.text;
    const entities = ctx.msg?.entities;

    if (!entities || !text) {
        return text;
    }

    let tags: { index: number; tag: string | undefined }[] = [];

    entities.forEach((entity) => {
        const startTag = getTag(entity, text);
        let searchTag = tags.filter((tag) => tag.index === entity.offset);
        if (searchTag.length > 0 && startTag) searchTag[0].tag += startTag;
        else
            tags.push({
                index: entity.offset,
                tag: startTag,
            });

        const closeTag = startTag?.indexOf("<a ") === 0 ? "</a>" : "</" + startTag?.slice(1);
        searchTag = tags.filter((tag) => tag.index === entity.offset + entity.length);
        if (searchTag.length > 0) searchTag[0].tag = closeTag + searchTag[0].tag;
        else
            tags.push({
                index: entity.offset + entity.length,
                tag: closeTag,
            });
    });
    let html = "";
    for (let i = 0; i < text.length; i++) {
        const tag = tags.filter((tag) => tag.index === i);
        tags = tags.filter((tag) => tag.index !== i);
        if (tag.length > 0) html += tag[0].tag;
        html += text[i];
    }
    if (tags.length > 0) html += tags[0].tag;

    return html;
}

const getTag = (entity: any, text: string) => {
    const entityText = text.slice(entity.offset, entity.offset + entity.length);

    switch (entity.type) {
        case "bold":
            return `<strong>`;
        case "text_link":
            return `<a href="${entity.url}" target="_blank">`;
        case "url":
            return `<a href="${entityText}" target="_blank">`;
        case "italic":
            return `<em>`;
        case "code":
            return `<code>`;
        case "strikethrough":
            return `<s>`;
        case "underline":
            return `<u>`;
        case "pre":
            return `<pre>`;
        case "mention":
            return `<a href="https://t.me/${entityText.replace("@", "")}" target="_blank">`;
        case "email":
            return `<a href="mailto:${entityText}">`;
        case "phone_number":
            return `<a href="tel:${entityText}">`;
    }
};
