import { Component, type OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppService } from '../app.service';
import { MiscStatsComponent } from './misc-stats/misc-stats.component';
import { PackageSearchComponent } from './package-search/package-search.component';
import { PackageStatsComponent } from './package-stats/package-stats.component';

@Component({
  selector: 'app-stats-page',
  imports: [FormsModule, PackageSearchComponent, PackageStatsComponent, MiscStatsComponent],
  templateUrl: './stats-page.html',
  styleUrl: './stats-page.css',
})
// eslint-disable-next-line @angular-eslint/component-class-suffix
export class StatsPage implements OnInit {
  currentView = 'search';
  total30dUsers = 'loading ... ☕️';

  constructor(private appService: AppService) {}

  async ngOnInit(): Promise<void> {
    void this.get30DayUsers();
  }

  /**
   * Change the display view to the value of the clicked button.
   * @param event
   */
  changeDisplay(event: any): void {
    this.currentView = event.target.id.split('-')[1];
  }

  /**
   * Get total users count.
   */
  async get30DayUsers(): Promise<void> {
    this.appService.get30dayUsers().subscribe({
      next: (res) => {
        this.total30dUsers = res;
      },
      error: (err) => {
        console.error(err);
        this.total30dUsers = 'failed to load users count 😔';
      },
    });
  }
}
