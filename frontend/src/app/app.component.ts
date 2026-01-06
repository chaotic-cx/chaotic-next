import { NgOptimizedImage, registerLocaleData } from '@angular/common';
import localeEnGb from '@angular/common/locales/en-GB';
import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { Router, RouterModule, RouterOutlet } from '@angular/router';
import { MessageToastService, ShellComponent } from '@garudalinux/core';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en.json';
import { ConfirmationService, MenuItem } from 'primeng/api';
import { routeAnimations } from './app.routes';
import { FooterComponent } from './footer/footer.component';
import { AppService } from './app.service';
import { BuildStatus, ChaoticEvent } from '@./shared-lib';
import { LoadingService } from './loading/loading.service';
import { ProgressSpinner } from 'primeng/progressspinner';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { UpdateService } from './update/update.service';
import { Tooltip } from 'primeng/tooltip';

@Component({
  imports: [
    RouterModule,
    ShellComponent,
    ConfirmDialog,
    NgOptimizedImage,
    FooterComponent,
    ProgressSpinner,
    ProgressSpinner,
    ProgressSpinner,
    Tooltip,
  ],
  selector: 'chaotic-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  animations: [routeAnimations],
  providers: [ConfirmationService, UpdateService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);

  protected readonly loadingService = inject(LoadingService);

  items: MenuItem[] = [
    {
      icon: 'pi pi-home',
      label: 'Home',
      routerLink: '/',
      tooltip: 'Go to the homepage',
    },
    {
      icon: 'pi pi-book',
      label: 'Get started',
      routerLink: '/docs',
      tooltip: 'View documentation and guides',
    },
    {
      icon: 'pi pi-gauge',
      label: 'Build status',
      routerLink: '/status',
      tooltip: 'Check current build status and queue',
    },
    {
      icon: 'pi pi-receipt',
      label: 'Deployments',
      routerLink: '/deployments',
      tooltip: 'View deployment logs and history',
    },
    {
      icon: 'pi pi-table',
      label: 'Packages',
      routerLink: '/packages',
      tooltip: 'Browse available packages',
    },
    {
      icon: 'pi pi-chart-bar',
      label: 'Statistics',
      routerLink: '/stats',
      tooltip: 'View usage statistics and charts',
    },
    {
      icon: 'pi pi-cloud-download',
      label: 'Mirrors',
      routerLink: '/mirrors',
      tooltip: 'Find mirror servers for downloads',
    },
    {
      icon: 'pi pi-trophy',
      label: 'Memorial',
      routerLink: '/memorial-v2',
      tooltip: 'View contributor memorial',
    },
    {
      icon: 'pi pi-user',
      label: 'About us',
      routerLink: '/about',
      tooltip: 'Learn about the Chaotic-AUR project',
    },
  ];

  async ngOnInit() {
    TimeAgo.addDefaultLocale(en);
    registerLocaleData(localeEnGb);

    this.updateMetaTags();

    this.appService.serverEvents.onmessage = ({ data }) => {
      const event = JSON.parse(data) as ChaoticEvent;
      if (event.type === 'build' && event.status === BuildStatus.SUCCESS) {
        const validRoutesRegex = /^\/(status|deployments|packages)(\?.*|#.*)?$/;
        if (!this.router.url || validRoutesRegex.test(this.router.url))
          this.messageToastService.success(
            'Package deployment',
            `${event.package}-${event.version}-${event.pkgrel} has just been deployed to ${event.repo} 🚀`,
          );
      }

      this.appService.chaoticSse$.next(event);
    };
  }

  /**
   * Returns the animation state of the next page for page transitions
   * @param outlet Router outlet element
   * @returns The animation state of the target route
   */
  prepareRoute(outlet: RouterOutlet): string {
    return outlet.activatedRouteData['animationState'];
  }

  private updateMetaTags() {
    this.meta.addTag({ name: 'description', content: "Building packages for you, so you don't have to!" });
    this.meta.addTag({ name: 'keywords', content: 'Chaotic-AUR, AUR, repository, Archlinux' });
    this.meta.addTag({ property: 'og:title', content: 'Chaotic-AUR - automated binary repo 👨🏻‍💻' });
    this.meta.addTag({ property: 'og:description', content: "Building packages for you, so you don't have to!" });
    this.meta.addTag({ property: 'og:image', content: '/assets/logo.png' });
    this.meta.addTag({ property: 'og:site_name', content: 'Chaotic-AUR' });
    this.meta.addTag({ property: 'og:url', content: 'https://aur.chaotic.cx' });
  }
}
