import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css',
})
export class AdminComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly routerEvents = toSignal(this.router.events, { initialValue: null });
  private readonly nav = viewChild.required<ElementRef<HTMLElement>>('nav');
  private readonly links = viewChildren<ElementRef<HTMLAnchorElement>>('navLink');

  protected readonly groups = ADMIN_NAV;

  protected readonly activeItem = computed(() => {
    void this.routerEvents();
    return findAdminNavItem(this.route.firstChild?.snapshot?.url?.[0]?.path);
  });

  protected readonly indicator = signal<IndicatorBox | null>(null);

  constructor() {
    setPageSeo(
      'Admin · Chaotic-AUR',
      'Administrative tools for the Chaotic-AUR backend',
      'Chaotic-AUR, Admin, Repository, Packages, Builders, Archlinux',
    );

    afterRenderEffect(() => {
      const activePath = this.activeItem().path;
      const link = this.links().find((ref) => ref.nativeElement.dataset['path'] === activePath);
      this.indicator.set(link ? this.measure(link.nativeElement) : null);
    });
  }

  protected onNavResize(): void {
    const activePath = this.activeItem().path;
    const link = this.links().find((ref) => ref.nativeElement.dataset['path'] === activePath);
    if (link) this.indicator.set(this.measure(link.nativeElement));
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
