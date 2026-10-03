import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { Card } from '@openng/optimus-ui/card';
import { Image } from '@openng/optimus-ui/image';
import { ProgressSpinner } from '@openng/optimus-ui/progressspinner';
import { setPageSeo } from '../functions';
import { TitleComponent } from '../title/title.component';
import { type MemorialConfig } from './memorial.configs';

interface MemorialImage {
  author: string;
  full: string;
  preview: string;
}

function buildLinks(filenames: string[], specialTreatment: string[], folder: string, year: number): MemorialImage[] {
  const links: MemorialImage[] = [];
  for (const filename of filenames) {
    if (specialTreatment.includes(filename)) continue;
    const author = filename.replace(/\.(png|jpg|jpeg|webp)$/i, '');
    const url = `/memorials/${year}/${folder}/${filename}.webp`;
    links.push({ author, full: url, preview: url });
  }
  return links;
}

@Component({
  selector: 'chaotic-memorial',
  imports: [Card, Image, TitleComponent, ProgressSpinner, RouterLink, TranslocoDirective],
  templateUrl: './memorial.component.html',
  styleUrl: './memorial.component.css',
})
export class MemorialComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);

  protected readonly config = this.route.snapshot.data['memorial'] as MemorialConfig;

  readonly desktopLinks = buildLinks(this.config.desktops, this.config.specialDesktops, 'desktops', this.config.year);

  readonly termLinks = buildLinks(this.config.terms, this.config.specialTerms, 'terminals', this.config.year);

  constructor() {
    const routeTitleKey = this.route.snapshot.title ?? '';

    setPageSeo(
      this.transloco.translate('routes.titleFormat', { page: this.transloco.translate(routeTitleKey) }),
      this.transloco.translate(this.config.descriptionKey),
      this.transloco.translate(this.config.keywordsKey),
    );
  }
}
