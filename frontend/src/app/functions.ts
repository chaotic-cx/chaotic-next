import { type Deployment } from '@./shared-lib';
import { Meta } from '@angular/platform-browser';
import { Message } from './newsfeed/interfaces';

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
 * @param repoUrls The URLs for the repositories, derived from appConfig
 * @returns The URL for the repository, in which the PKGBUILD is located.
 */
export function generateRepoUrl(
  deployment: Deployment,
  repoUrls: {
    garuda: string;
    chaotic: string;
  },
): string | undefined {
  if (deployment.repo.match(/chaotic-aur$/) !== null) {
    deployment.sourceUrl = repoUrls.chaotic;
    return deployment.sourceUrl;
  }
  if (deployment.repo.match(/garuda$/) !== null) {
    deployment.sourceUrl = repoUrls.garuda;
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
 * Convert the entity object of a Telegram message to HTML.
 * @param message The Telegram message to convert.
 * @returns A string containing the message as HTML.
 */
export function entityToHtml(message: Message): string {
  let returnValue = '';
  if (!message.text) {
    return '';
  } else if (typeof message.text === 'string') {
    returnValue = message.text;
  } else {
    returnValue = message.text
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        } else {
          switch (item.type) {
            case 'text_link':
              return `<a class="text-mauve" href="${item.href}" target="_blank">${item.text}</a>`;
            case 'bold':
              return `<strong>${item.text}</strong>`;
            case 'code':
              return `<code>${item.text}</code>`;
            case 'italic':
              return `<em>${item.text}</em>`;
            case 'pre':
              return `<pre>${item.text}</pre>`;
            case 'strikethrough':
              return `<s>${item.text}</s>`;
            case 'underline':
              return `<u>${item.text}</u>`;
            case 'mention':
              return `<a class="text-mauve" href="https://t.me/${item.text.replace('@', '')}" target="_blank">${item.text}</a>`;
            case 'email':
              return `<a class="text-mauve" href="mailto:${item.text}">${item.text}</a>`;
            case 'phone_number':
              return `<a class="text-mauve" href="tel:${item.text}">${item.text}</a>`;
            default:
              return item.text;
          }
        }
      })
      .join('');
  }
  return returnValue.replaceAll('\n', '<br>');
}

const getTag = (entity: any) => {
  switch (entity.type) {
    case 'bold':
      return '<strong>';
    case 'text_link':
      return `<a href="${entity.href}" target="_blank">`;
    case 'url':
      return `<a href="${entity.text}" target="_blank">`;
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
      return `<a href="https://t.me/${entity.text.replace('@', '')}" target="_blank">`;
    case 'email':
      return `<a href="mailto:${entity.text}">`;
    case 'phone_number':
      return `<a href="tel:${entity.text}">`;
  }

  return undefined;
};

/**
 * Shuffle an array.
 * @param array The array to shuffle.
 * @returns The shuffled array.
 */
export function shuffleArray(array: any[]): any[] {
  for (let i = array.length - 1; i >= 0; i--) {
    const j: number = Math.floor(Math.random() * (i + 1));
    const temp: any = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array;
}

/**
 * Update the meta tags for the current page.
 */
export function updateSeoTags(
  meta: Meta,
  title: string,
  description: string,
  keywords: string,
  url: string,
  image?: string,
): void {
  meta.updateTag({ name: 'description', content: description });
  meta.updateTag({ name: 'keywords', content: keywords });
  meta.updateTag({ property: 'og:title', content: title });
  meta.updateTag({ property: 'og:description', content: description });
  meta.updateTag({ property: 'og:url', content: url });
  if (image) meta.updateTag({ property: 'og:image', content: image });
}
