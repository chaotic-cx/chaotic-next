import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { PrimeTemplate } from '@openng/optimus-ui/api';
import { Divider } from '@openng/optimus-ui/divider';
import { Panel } from '@openng/optimus-ui/panel';
import { updateSeoTags } from '../functions';
import { TitleComponent } from '../title/title.component';

@Component({
  selector: 'chaotic-code-of-conduct',
  templateUrl: './code-of-conduct.component.html',
  styleUrl: './code-of-conduct.component.css',
  imports: [Panel, Divider, TitleComponent, PrimeTemplate],
})
export class CodeOfConductComponent implements OnInit {
  private readonly meta = inject(Meta);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit() {
    updateSeoTags(this.meta, {
      title: 'Code of Conduct',
      description: 'Contributor Covenant Code of Conduct for Chaotic-AUR',
      keywords: 'Chaotic-AUR, Code of Conduct, Contributor Covenant',
      url: this.router.url,
    });

    this.route.fragment
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((fragment) => this.scrollToFragment(fragment));
  }

  private scrollToFragment(fragment: string | null): void {
    if (!fragment) return;
    document.getElementById(fragment)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  scrollTo(id: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      fragment: id,
      info: { disableViewTransition: true },
    });
  }
}
