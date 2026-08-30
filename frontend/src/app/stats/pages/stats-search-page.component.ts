import { Component, input } from '@angular/core';
import { Card } from '@openng/optimus-ui/card';
import { SearchPackageComponent } from '../../search-package/search-package.component';

@Component({
  selector: 'chaotic-stats-search-page',
  imports: [Card, SearchPackageComponent],
  styleUrl: './stats-chart-page.css',
  template: `
    <p-card [style]="{ overflow: 'hidden', height: 'auto' }" animate.enter="ctp-scale-enter">
      <chaotic-search-package [search]="search()" />
    </p-card>
  `,
})
export class StatsSearchPageComponent {
  readonly search = input<string>();
}
