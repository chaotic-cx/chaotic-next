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
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { setPageSeo } from '../functions';
import { ADMIN_NAV, findAdminNavItem } from './admin-nav';

interface IndicatorBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

@Component({
  selector: 'chaotic-admin',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslocoDirective],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css',
})
export class AdminComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly routerEvents = toSignal(this.router.events, { initialValue: null });
  private readonly nav = viewChild.required<ElementRef<HTMLElement>>('nav');
  private readonly links = viewChildren<ElementRef<HTMLAnchorElement>>('navLink');

  protected readonly groups = ADMIN_NAV;

  protected readonly activeItem = computed(() => {
    void this.routerEvents();
    return findAdminNavItem(this.route.firstChild?.snapshot?.url?.[0]?.path);
  });

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
