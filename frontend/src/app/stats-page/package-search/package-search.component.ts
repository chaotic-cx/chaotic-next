import { type SpecificPackageMetrics } from '@./shared-lib';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppService } from '../../app.service';

@Component({
  selector: 'app-package-search',
  imports: [FormsModule],
  templateUrl: './package-search.component.html',
  styleUrl: './package-search.component.css',
})
export class PackageSearchComponent {
  packageMetrics: SpecificPackageMetrics = { downloads: 0, user_agents: [] };
  loading = false;
  searchPackage = '';
  initialSearchDone = false;

  constructor(private appService: AppService) {}

  updateDisplay(): void {
    if (/^[0-9|a-zA-Z-]*$/.test(this.searchPackage)) {
      this.loading = true;
      this.appService.getSpecificPackageMetrics(this.searchPackage).subscribe({
        next: (result) => {
          this.packageMetrics = result;
          this.loading = false;
          this.initialSearchDone = true;
        },
        error: (err) => {
          console.error(err);
          this.loading = false;
        },
      });
    } else {
      alert('This does not look like a valid package name!');
    }
  }
}
