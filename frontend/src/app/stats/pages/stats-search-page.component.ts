import { Component, input } from '@angular/core';
import { Card } from '@openng/optimus-ui/card';
import { SearchPackageComponent } from '../../search-package/search-package.component';

@Component({
  selector: 'chaotic-stats-search-page',
  imports: [Card, SearchPackageComponent],
  template: `
    <p-card [style]="{ overflow: 'hidden', height: 'auto' }">
      <chaotic-search-package [search]="search()" />
    </p-card>
  `,
  styleUrl: './stats-chart-page.css',
})
export class StatsSearchPageComponent {
  readonly search = input<string>();
}
