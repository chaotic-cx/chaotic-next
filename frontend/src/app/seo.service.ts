import { DOCUMENT } from '@angular/common';
import { inject, Service } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { APP_CONFIG } from '../environments/app-config.token';

export interface SeoTags {
  title: string;
  description: string;
  keywords: string;
  url: string;
  image?: string;
}

const DEFAULT_IMAGE_PATH = '/assets/logo_400.png';
const SITE_NAME = 'Chaotic-AUR';

const TWITTER_CARD = 'summary';

@Service()
export class SeoService {
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly siteUrl = inject(APP_CONFIG).homeUrl;

  update(seo: SeoTags): void {
    const url = this.absoluteUrl(seo.url);
    this.writeText(seo);
    this.meta.updateTag({ property: 'og:url', content: url });
    this.setCanonical(url);
  }

  applySiteDefaults(defaults: Omit<SeoTags, 'url'>): void {
    this.meta.updateTag({ property: 'og:site_name', content: SITE_NAME });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ name: 'twitter:card', content: TWITTER_CARD });
    if (this.meta.getTag("property='og:title'")) return;

    this.writeText(defaults);
  }

  private writeText(seo: Omit<SeoTags, 'url'>): void {
    this.meta.updateTag({ name: 'description', content: seo.description });
    this.meta.updateTag({ name: 'keywords', content: seo.keywords });
    this.meta.updateTag({ property: 'og:title', content: seo.title });
    this.meta.updateTag({ property: 'og:description', content: seo.description });
    this.meta.updateTag({ property: 'og:image', content: this.absoluteUrl(seo.image ?? DEFAULT_IMAGE_PATH) });
  }

  private absoluteUrl(path: string): string {
    const url = new URL(path, this.siteUrl);
    url.search = '';
    url.hash = '';

    return url.toString();
  }

  private setCanonical(url: string): void {
    let link = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'canonical';
      this.document.head.appendChild(link);
    }

    link.href = url;
  }
}
