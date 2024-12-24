import { __decorate, __metadata } from 'tslib';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AppService } from '../app.service';
import { MiscStatsComponent } from './misc-stats/misc-stats.component';
import { PackageSearchComponent } from './package-search/package-search.component';
import { PackageStatsComponent } from './package-stats/package-stats.component';
let StatsPage = class StatsPage {
  constructor(appService) {
    this.appService = appService;
    this.currentView = 'search';
    this.total30dUsers = 'loading ... ☕️';
  }
  async ngOnInit() {
    void this.get30DayUsers();
  }
  /**
   * Change the display view to the value of the clicked button.
   * @param event
   */
  changeDisplay(event) {
    this.currentView = event.target.id.split('-')[1];
  }
  /**
   * Get total users count.
   */
  async get30DayUsers() {
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
};
StatsPage = __decorate(
  [
    Component({
      selector: 'app-stats-page',
      imports: [
        FormsModule,
        PackageSearchComponent,
        PackageStatsComponent,
        MiscStatsComponent,
        RouterLink,
        RouterLinkActive,
      ],
      templateUrl: './stats-page.html',
      styleUrl: './stats-page.css',
    }),
    // eslint-disable-next-line @angular-eslint/component-class-suffix
    __metadata('design:paramtypes', [AppService]),
  ],
  StatsPage,
);
export { StatsPage };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdHMtcGFnZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN0YXRzLXBhZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU8sRUFBRSxTQUFTLEVBQWUsTUFBTSxlQUFlLENBQUM7QUFDdkQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQzdDLE9BQU8sRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMvRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDNUMsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdkUsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDbkYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFnQnpFLElBQU0sU0FBUyxHQUFmLE1BQU0sU0FBUztJQUlsQixZQUFvQixVQUFzQjtRQUF0QixlQUFVLEdBQVYsVUFBVSxDQUFZO1FBSDFDLGdCQUFXLEdBQUcsUUFBUSxDQUFDO1FBQ3ZCLGtCQUFhLEdBQUcsZ0JBQWdCLENBQUM7SUFFWSxDQUFDO0lBRTlDLEtBQUssQ0FBQyxRQUFRO1FBQ1YsS0FBSyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7SUFDOUIsQ0FBQztJQUVEOzs7T0FHRztJQUNILGFBQWEsQ0FBQyxLQUFVO1FBQ3BCLElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3JELENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxhQUFhO1FBQ2YsSUFBSSxDQUFDLFVBQVUsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxTQUFTLENBQUM7WUFDdEMsSUFBSSxFQUFFLENBQUMsR0FBRyxFQUFFLEVBQUU7Z0JBQ1YsSUFBSSxDQUFDLGFBQWEsR0FBRyxHQUFHLENBQUM7WUFDN0IsQ0FBQztZQUNELEtBQUssRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFO2dCQUNYLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ25CLElBQUksQ0FBQyxhQUFhLEdBQUcsK0JBQStCLENBQUM7WUFDekQsQ0FBQztTQUNKLENBQUMsQ0FBQztJQUNQLENBQUM7Q0FDSixDQUFBO0FBaENZLFNBQVM7SUFkckIsU0FBUyxDQUFDO1FBQ1AsUUFBUSxFQUFFLGdCQUFnQjtRQUMxQixPQUFPLEVBQUU7WUFDTCxXQUFXO1lBQ1gsc0JBQXNCO1lBQ3RCLHFCQUFxQjtZQUNyQixrQkFBa0I7WUFDbEIsVUFBVTtZQUNWLGdCQUFnQjtTQUNuQjtRQUNELFdBQVcsRUFBRSxtQkFBbUI7UUFDaEMsUUFBUSxFQUFFLGtCQUFrQjtLQUMvQixDQUFDO0lBQ0Ysa0VBQWtFOztxQ0FLOUIsVUFBVTtHQUpqQyxTQUFTLENBZ0NyQiJ9
