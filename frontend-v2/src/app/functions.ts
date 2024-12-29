import { CAUR_LOGS_URL, CAUR_REPO_URL, CAUR_REPO_URL_GARUDA, type Deployment } from '@./shared-lib';

/**
 * Poll for new deployments.
 * @param interval The interval to poll at.
 * @param func The function to call.
 */
export function startShortPolling(interval: any, func: () => void): void {
  let initialInterval: any;
  interval = setInterval(func, interval);
  clearInterval(initialInterval);
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
  return new Date().toLocaleString('en-GB', { timeZone: 'UTC' });
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
 * Parses a static log URL to a live log URL.
 * From: /logs/api/logs/strawberry-git/1728221997487
 * To: /logs/logs.html?timestamp=1728139106459&id=kodi-git
 * @param url The static log URL.
 * @returns The live log URL.
 */
export function toLiveLog(url: string): string {
  const splitUrl = url.split('/');
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

/**
 * Convert the entities object of a Telegram message to HTML.
 * @param ctx The context of the message.
 * @returns A string containing the message as HTML.
 */
export function entityToHtml(ctx: any) {
  const text = ctx.msg?.text;
  const entities = ctx.msg?.entities;

  if (!entities || !text) {
    return text;
  }

  let tags: { index: number; tag: string | undefined }[] = [];

  for (const entity of entities) {
    const startTag = getTag(entity, text);
    let searchTag = tags.filter((tag) => tag.index === entity.offset);
    if (searchTag.length > 0 && startTag) searchTag[0].tag += startTag;
    else
      tags.push({
        index: entity.offset,
        tag: startTag,
      });

    const closeTag = startTag?.indexOf('<a ') === 0 ? '</a>' : `</${startTag?.slice(1)}`;
    searchTag = tags.filter((tag) => tag.index === entity.offset + entity.length);
    if (searchTag.length > 0) searchTag[0].tag = closeTag + searchTag[0].tag;
    else
      tags.push({
        index: entity.offset + entity.length,
        tag: closeTag,
      });
  }

  let html = '';
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
    case 'bold':
      return '<strong>';
    case 'text_link':
      return `<a href="${entity.url}" target="_blank">`;
    case 'url':
      return `<a href="${entityText}" target="_blank">`;
    case 'italic':
      return '<em>';
    case 'code':
      return '<code>';
    case 'strikethrough':
      return '<s>';
    case 'underline':
      return '<u>';
    case 'pre':
      return '<pre>';
    case 'mention':
      return `<a href="https://t.me/${entityText.replace('@', '')}" target="_blank">`;
    case 'email':
      return `<a href="mailto:${entityText}">`;
    case 'phone_number':
      return `<a href="tel:${entityText}">`;
  }

  return undefined;
};
