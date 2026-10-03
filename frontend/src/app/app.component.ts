import { NgOptimizedImage, registerLocaleData } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { BuildStatus, formatPkgrel } from '@chaotic-next/shared-lib';
import { MessageToastService } from '@garudalinux/core/message-toast';
import { ShellComponent } from '@garudalinux/core/shell';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MenuItem } from '@openng/optimus-ui/api';
import { ConfirmDialog } from '@openng/optimus-ui/confirmdialog';
import { ProgressSpinner } from '@openng/optimus-ui/progressspinner';
import { AppService } from './app.service';
import { AuthButtonComponent } from './auth/auth-button.component';
import { SessionExpiredBannerComponent } from './auth/session-expired-banner.component';
import { FooterComponent } from './footer/footer.component';
import { injectActiveTranslation } from './i18n/active-translation';
import { LanguageSwitcherComponent } from './language-switcher/language-switcher.component';
import { LoadingService } from './loading/loading.service';
import { lightLogo } from './logo';
import { MobileNavComponent } from './mobile-nav/mobile-nav.component';
import { NavActiveCurrentDirective } from './nav-active-current.directive';
import { ThemeSwitcherComponent } from './theme-switcher/theme-switcher.component';
import { ConnectionBannerComponent } from './ui-states/connection-banner.component';
import { UpdateService } from './update/update.service';

@Component({
  imports: [
    RouterLink,
    RouterOutlet,
    ShellComponent,
    ConfirmDialog,
    NgOptimizedImage,
    FooterComponent,
    ProgressSpinner,
    AuthButtonComponent,
    LanguageSwitcherComponent,
    ThemeSwitcherComponent,
    MobileNavComponent,
    ConnectionBannerComponent,
    SessionExpiredBannerComponent,
    TranslocoDirective,
    NavActiveCurrentDirective,
  ],
  selector: 'chaotic-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  providers: [ConfirmationService, UpdateService],
})
export class AppComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly messageToastService = inject(MessageToastService);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly _updateService = inject(UpdateService);

  protected readonly loadingService = inject(LoadingService);
  protected readonly lightLogo = lightLogo;

  private readonly activeTranslation = injectActiveTranslation();

  protected readonly mobileNavOpen = signal(false);

  protected closeMobileNav(trigger: HTMLButtonElement): void {
    this.mobileNavOpen.set(false);
    trigger.focus();
  }

  protected skipToContent(event: Event, main: HTMLElement): void {
    event.preventDefault();
    main.focus();
  }

  private readonly homeItem = computed<MenuItem>(() => {
    this.activeTranslation();

    return {
      icon: 'pi pi-home',
      label: this.transloco.translate('nav.home.label'),
      routerLink: '/',
      tooltip: this.transloco.translate('nav.home.tooltip'),
    };
  });

  private readonly primaryItems = computed<MenuItem[]>(() => {
    this.activeTranslation();

    return [
      {
        icon: 'pi pi-book',
        label: this.transloco.translate('nav.docs.label'),
        routerLink: '/docs',
        tooltip: this.transloco.translate('nav.docs.tooltip'),
      },
      {
        icon: 'pi pi-table',
        label: this.transloco.translate('nav.packages.label'),
        routerLink: '/packages',
        tooltip: this.transloco.translate('nav.packages.tooltip'),
      },
      {
        icon: 'pi pi-gauge',
        label: this.transloco.translate('nav.buildStatus.label'),
        routerLink: '/status',
        tooltip: this.transloco.translate('nav.buildStatus.tooltip'),
      },
      {
        icon: 'pi pi-check-square',
        label: this.transloco.translate('nav.reviewQueue.label'),
        routerLink: '/review-queue',
        tooltip: this.transloco.translate('nav.reviewQueue.tooltip'),
      },
      {
        icon: 'pi pi-verified',
        label: this.transloco.translate('nav.aurScan.label'),
        routerLink: '/aur-scan',
        tooltip: this.transloco.translate('nav.aurScan.tooltip'),
      },
    ];
  });

  private readonly secondaryItems = computed<MenuItem[]>(() => {
    this.activeTranslation();

    return [
      {
        icon: 'pi pi-chart-bar',
        label: this.transloco.translate('nav.stats.label'),
        routerLink: '/stats',
        tooltip: this.transloco.translate('nav.stats.tooltip'),
      },
      {
        icon: 'pi pi-receipt',
        label: this.transloco.translate('nav.deployments.label'),
        routerLink: '/deployments',
        tooltip: this.transloco.translate('nav.deployments.tooltip'),
      },
      {
        icon: 'pi pi-cloud-download',
        label: this.transloco.translate('nav.mirrors.label'),
        routerLink: '/mirrors',
        tooltip: this.transloco.translate('nav.mirrors.tooltip'),
      },
      {
        icon: 'pi pi-user',
        label: this.transloco.translate('nav.about.label'),
        routerLink: '/about',
        tooltip: this.transloco.translate('nav.about.tooltip'),
      },
    ];
  });

  protected readonly menuItems = computed<MenuItem[]>(() => [
    ...this.primaryItems(),
    { icon: 'pi pi-ellipsis-h', label: this.transloco.translate('nav.more'), items: this.secondaryItems() },
  ]);

  protected readonly mobileItems = computed<MenuItem[]>(() => [
    this.homeItem(),
    ...this.primaryItems(),
    ...this.secondaryItems(),
  ]);

  ngOnInit() {
    void this.loadLocale();

    this.updateMetaTags();

    this.appService.chaoticEvent.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event.type === 'build' && event.status === BuildStatus.SUCCESS) {
        if (!event.version || event.version === 'unknown') return;
        const validRoutesRegex = /^\/(status|deployments|packages)(\?.*|#.*)?$/;
        if (!this.router.url || validRoutesRegex.test(this.router.url))
          this.messageToastService.success(
            this.transloco.translate('app.deploymentToast.title'),
            this.transloco.translate('app.deploymentToast.message', {
              package: `${event.package}-${event.version}-${formatPkgrel(event.pkgrel ?? 0, event.bump ?? 0)}`,
              repo: event.repo,
            }),
          );
      }
    });
  }

  private updateMetaTags() {
    const description = this.transloco.translate('app.meta.description');
    const keywords = this.transloco.translate('app.meta.keywords');
    const ogTitle = this.transloco.translate('app.meta.ogTitle');

    this.meta.addTag({ name: 'description', content: description });
    this.meta.addTag({ name: 'keywords', content: keywords });
    this.meta.addTag({ property: 'og:title', content: ogTitle });
    this.meta.addTag({ property: 'og:description', content: description });
    this.meta.addTag({ property: 'og:image', content: '/assets/logo_400.png' });
    this.meta.addTag({ property: 'og:site_name', content: 'Chaotic-AUR' });
    this.meta.addTag({ property: 'og:url', content: 'https://aur.chaotic.cx' });
  }

  private async loadLocale(): Promise<void> {
    const lang = navigator.language.split('-')[0];

    try {
      const localeModule = await import(`@angular/common/locales/${lang}.mjs`);
      registerLocaleData(localeModule.default, lang);
    } catch {
      // Fallback: Angular will use its built-in en-US locale
    }
  }
}
