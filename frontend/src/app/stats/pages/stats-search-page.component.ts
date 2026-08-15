import { Component, input } from '@angular/core';
import { SearchPackageComponent } from '../../search-package/search-package.component';

@Component({
  selector: 'chaotic-stats-search-page',
  imports: [SearchPackageComponent],
  template: '<chaotic-search-package [search]="search()" />',
})
export class StatsSearchPageComponent {
  readonly search = input<string>();
}
