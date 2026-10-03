import { Location } from '@angular/common';
import { afterNextRender, Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { APP_CONFIG } from '../../environments/app-config.token';
import { EnvironmentModel } from '../../environments/environment.model';
import { preferredScrollBehavior, setPageSeo } from '../functions';
import { TitleComponent } from '../title/title.component';
import { CodeBlockComponent } from './code-block.component';

interface DocsSection {
  id: string;
  titleKey: string;
}

const DOCS_SECTIONS: DocsSection[] = [
  { id: 'setup', titleKey: marker('docs.sections.setup') },
  { id: 'important', titleKey: marker('docs.sections.reportingBugs') },
  { id: 'package-builds', titleKey: marker('docs.sections.packageBuilds') },
  { id: 'requesting-new-packages', titleKey: marker('docs.sections.requestingNewPackages') },
  { id: 'recommendations', titleKey: marker('docs.sections.recommendations') },
  { id: 'update-review-process', titleKey: marker('docs.sections.updateReviewProcess') },
  { id: 'aur-package-scan', titleKey: marker('docs.sections.aurPackageScan') },
  { id: 'public-api', titleKey: marker('docs.sections.publicApi') },
  { id: 'further-information', titleKey: marker('docs.sections.furtherInformation') },
];

/* A section counts as active once its top passes the upper third of the viewport. */
const SCROLLSPY_ROOT_MARGIN = '0px 0px -66% 0px';
const SCROLLSPY_RESUME_FALLBACK_MS = 1200;

@Component({
  selector: 'chaotic-docs',
  templateUrl: './docs.component.html',
  styleUrl: './docs.component.css',
  imports: [TitleComponent, RouterLink, CodeBlockComponent, TranslocoDirective],
})
export class DocsComponent {
  private readonly appConfig: EnvironmentModel = inject(APP_CONFIG);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  readonly sections = DOCS_SECTIONS;
  readonly activeSection = signal<string>(DOCS_SECTIONS[0].id);

  private scrollspyPaused = false;

  readonly appendRepo = '[chaotic-aur]\nInclude = /etc/pacman.d/chaotic-mirrorlist';
  readonly ignorePkg = 'IgnorePkg = ...';
  readonly installPackage = '$ sudo pacman -S firedragon';
  readonly installPackageParu = '$ paru -S chaotic-aur/firefox-nightly';
  readonly installPackageSpecific = '$ sudo pacman -S chaotic-aur/mesa-tkg-git';
  readonly installRepoPackages =
    "$ sudo pacman -U 'https://cdn-mirror.chaotic.cx/chaotic-aur/chaotic-keyring.pkg.tar.zst'\n" +
    "$ sudo pacman -U 'https://cdn-mirror.chaotic.cx/chaotic-aur/chaotic-mirrorlist.pkg.tar.zst'";
  readonly receiveKeys: string;
  readonly syncMirrors = '$ sudo pacman -Syu';
  readonly apiDocsUrl = `${this.appConfig.backendUrl}/api/docs`;

  constructor() {
    setPageSeo(
      this.transloco.translate('routes.titleFormat', { page: this.transloco.translate('routes.docs') }),
      this.transloco.translate('docs.seo.description'),
      this.transloco.translate('docs.seo.keywords'),
    );
    this.receiveKeys =
      `$ sudo pacman-key --recv-key ${this.appConfig.primaryKey} --keyserver keyserver.ubuntu.com\n` +
      `$ sudo pacman-key --lsign-key ${this.appConfig.primaryKey}`;

    afterNextRender(() => this.observeSections());
  }

  jumpTo(event: MouseEvent, id: string): void {
    event.preventDefault();
    const target = document.getElementById(id);
    if (!target) return;

    this.activeSection.set(id);
    this.pauseScrollspy();
    target.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' });
    this.location.replaceState(`${this.location.path(false)}#${id}`);
  }

  private pauseScrollspy(): void {
    this.scrollspyPaused = true;
    const resume = (): void => {
      this.scrollspyPaused = false;
      window.clearTimeout(fallback);
    };
    const fallback = window.setTimeout(resume, SCROLLSPY_RESUME_FALLBACK_MS);
    window.addEventListener('scrollend', resume, { once: true });
  }

  private observeSections(): void {
    const observer = new IntersectionObserver(
      (entries) => {
        if (this.scrollspyPaused) return;
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) this.activeSection.set(visible.target.id);
      },
      { rootMargin: SCROLLSPY_ROOT_MARGIN },
    );
    document.querySelectorAll('[data-docs-section]').forEach((section) => observer.observe(section));
    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}
