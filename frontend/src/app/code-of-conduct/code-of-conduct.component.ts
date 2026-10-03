import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { PrimeTemplate } from '@openng/optimus-ui/api';
import { Divider } from '@openng/optimus-ui/divider';
import { Panel } from '@openng/optimus-ui/panel';
import { preferredScrollBehavior, setPageSeo } from '../functions';
import { TitleComponent } from '../title/title.component';

@Component({
  selector: 'chaotic-code-of-conduct',
  templateUrl: './code-of-conduct.component.html',
  styleUrl: './code-of-conduct.component.css',
  imports: [Panel, Divider, TitleComponent, PrimeTemplate, TranslocoDirective],
})
export class CodeOfConductComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  constructor() {
    setPageSeo(
      this.transloco.translate('routes.titleFormat', { page: this.transloco.translate('routes.codeOfConduct') }),
      this.transloco.translate('codeOfConduct.seo.description'),
      this.transloco.translate('codeOfConduct.seo.keywords'),
    );
  }

  ngOnInit() {
    this.route.fragment
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((fragment) => this.scrollToFragment(fragment));
  }

  private scrollToFragment(fragment: string | null): void {
    if (!fragment) return;
    document.getElementById(fragment)?.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' });
  }

  scrollTo(id: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      fragment: id,
    });
  }
}
