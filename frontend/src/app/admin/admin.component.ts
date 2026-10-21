import {
  afterNextRender,
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type MenuItem } from '@openng/optimus-ui/api';
import { Menu } from '@openng/optimus-ui/menu';
import { filter } from 'rxjs';
import { setPageSeo } from '../functions';
import { injectActiveTranslation } from '../i18n/active-translation';
import { matchMenuWidth } from '../menu-align';
import { ADMIN_NAV, type AdminNavItem, findAdminNavItem } from './admin-nav';

interface IndicatorBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

@Component({
  selector: 'chaotic-admin',
  imports: [Menu, RouterLink, RouterLinkActive, RouterOutlet, TranslocoDirective],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css',
})
export class AdminComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly activeTranslation = injectActiveTranslation();

  private readonly routerEvents = toSignal(this.router.events, { initialValue: null });
  private readonly nav = viewChild.required<ElementRef<HTMLElement>>('nav');
  private readonly links = viewChildren<ElementRef<HTMLAnchorElement>>('navLink');
  private readonly switcherMenu = viewChild.required<Menu>('switcherMenu');

  protected readonly groups = ADMIN_NAV;

  protected readonly activeItem = computed(() => {
    void this.routerEvents();
    return findAdminNavItem(this.route.firstChild?.snapshot?.url?.[0]?.path);
  });

  protected readonly switcherItems = computed<MenuItem[]>(() => {
    this.activeTranslation();
    return ADMIN_NAV.map((group) => ({
      label: this.transloco.translate(group.labelKey ?? 'admin.layout.title'),
      items: group.items.map((item) => this.toMenuItem(item)),
    }));
  });

  protected readonly switcherOpen = signal(false);

  protected readonly indicator = signal<IndicatorBox | null>(null);
  private pendingIndicatorFrame: number | null = null;

  constructor() {
    setPageSeo(
      this.transloco.translate('admin.layout.seo.title'),
      this.transloco.translate('admin.layout.seo.description'),
      this.transloco.translate('admin.layout.seo.keywords'),
    );

    afterRenderEffect(() => {
      this.updateIndicator();
    });

    afterNextRender(() => {
      this.observeNavResize();
    });

    // A navbar link to another admin page keeps this component, and with it the open popup.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.switcherMenu().hide());
  }

  protected onSwitcherShow(menu: Menu): void {
    matchMenuWidth(menu);
    this.switcherOpen.set(true);
  }

  private toMenuItem(item: AdminNavItem): MenuItem {
    return {
      label: this.transloco.translate(item.labelKey),
      icon: item.icon,
      routerLink: ['/admin', item.path],
    };
  }

  private observeNavResize(): void {
    const observer = new ResizeObserver(() => this.scheduleIndicatorUpdate());
    observer.observe(this.nav().nativeElement);

    this.destroyRef.onDestroy(() => {
      observer.disconnect();
      if (this.pendingIndicatorFrame !== null) {
        cancelAnimationFrame(this.pendingIndicatorFrame);
      }
    });
  }

  /**
   * Coalesces bursts of resize notifications into one measurement per frame.
   */
  private scheduleIndicatorUpdate(): void {
    if (this.pendingIndicatorFrame !== null) return;

    this.pendingIndicatorFrame = requestAnimationFrame(() => {
      this.pendingIndicatorFrame = null;
      this.updateIndicator();
    });
  }

  private updateIndicator(): void {
    const activePath = this.activeItem().path;
    const link = this.links().find((ref) => ref.nativeElement.dataset['path'] === activePath);
    if (link) {
      this.indicator.set(this.measure(link.nativeElement));
    } else {
      this.indicator.set(null);
    }
  }

  private measure(link: HTMLElement): IndicatorBox {
    const navBox = this.nav().nativeElement.getBoundingClientRect();
    const linkBox = link.getBoundingClientRect();
    return {
      top: linkBox.top - navBox.top + this.nav().nativeElement.scrollTop,
      left: linkBox.left - navBox.left + this.nav().nativeElement.scrollLeft,
      width: linkBox.width,
      height: linkBox.height,
    };
  }
}
