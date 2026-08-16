import { NgOptimizedImage, registerLocaleData } from '@angular/common';
import localeEnGb from '@angular/common/locales/en-GB';
import { Component, computed, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterModule,
} from '@angular/router';
import { BuildStatus } from '@chaotic-next/shared-lib';
import { MessageToastService, ShellComponent } from '@garudalinux/core';
import { ConfirmationService, MenuItem } from '@openng/optimus-ui/api';
import { ConfirmDialog } from '@openng/optimus-ui/confirmdialog';
import { ProgressSpinner } from '@openng/optimus-ui/progressspinner';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en.json';
import { AuthService } from 'ngx-better-auth';
import { AppService } from './app.service';
import { AuthButtonComponent } from './auth/auth-button.component';
import { FooterComponent } from './footer/footer.component';
import { isChaoticEvent } from './functions';
import { LoadingService } from './loading/loading.service';
import { OverlayScrollbarComponent } from './overlay-scrollbar/overlay-scrollbar.component';
import { UpdateService } from './update/update.service';

@Component({
  imports: [
    RouterModule,
    ShellComponent,
    ConfirmDialog,
    NgOptimizedImage,
    FooterComponent,
    OverlayScrollbarComponent,
    ProgressSpinner,
    AuthButtonComponent,
  ],
  selector: 'chaotic-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  providers: [ConfirmationService, UpdateService],
})
export class AppComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  protected readonly loadingService = inject(LoadingService);

  readonly items = computed<MenuItem[]>(() => [
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
      icon: 'pi pi-check-square',
      label: 'Pending reviews',
      routerLink: '/update-review',
      tooltip: 'Review and approve pending package updates',
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
  ]);

  constructor() {
    let firstNavigationComplete = false;
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) {
        if (firstNavigationComplete) {
          const info = this.router.getCurrentNavigation()?.extras?.info as Record<string, unknown> | undefined;
          if (!info?.['disableViewTransition']) {
            document.body.classList.add('is-transitioning');
          }
        }
      } else if (event instanceof NavigationCancel || event instanceof NavigationError) {
        document.body.classList.remove('is-transitioning');
      } else if (event instanceof NavigationEnd) {
        firstNavigationComplete = true;
        document.body.classList.remove('is-transitioning');
      }
    });
  }

  ngOnInit() {
    TimeAgo.addDefaultLocale(en);
    registerLocaleData(localeEnGb);

    this.updateMetaTags();

    this.appService.serverEvents.onmessage = ({ data }) => {
      const event: unknown = JSON.parse(data);
      if (!isChaoticEvent(event)) return;
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
