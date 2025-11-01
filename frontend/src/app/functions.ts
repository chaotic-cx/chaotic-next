import { Meta } from '@angular/platform-browser';

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
