import { type CountryRankList, type UserAgentList } from '@./shared-lib';
import { DatePipe } from '@angular/common';
import { type AfterViewInit, Component } from '@angular/core';
import { AppService } from '../../app.service';

@Component({
  selector: 'app-misc-stats',
  imports: [DatePipe],
  templateUrl: './misc-stats.component.html',
  styleUrl: './misc-stats.component.css',
})
export class MiscStatsComponent implements AfterViewInit {
  loading = true;
  lastUpdated: string | Date = 'Stats are currently loading...';
  userAgentMetrics: UserAgentList = [];
  countryRanks: CountryRankList = [];
  countryRankRange = 30;
  rankActive = true;
  userAgentActive = true;

  constructor(private appService: AppService) {}

  ngAfterViewInit(): void {
    this.updateAllMetrics();
  }

  /**
   * Update all metrics and sets the values of the user agent metrics and country ranks.
   */
  updateAllMetrics(): void {
    this.get30DayUserAgents();
    this.getCountryRanks();
  }

  /**
   * Query the number of user agents in the last 30 days.
   * @returns The number of user agents in the last 30 days.
   */
  private get30DayUserAgents(): void {
    this.userAgentActive = true;
    this.appService.get30dayUserAgents().subscribe({
      next: (data) => {
        // We don't want to display >30 user agents
        const rightAmount = data.slice(0, 30);
        // and also not too long user agent strings as that breaks visuals
        for (const entry of rightAmount) {
          if (entry.name.length > 50) {
            entry.name = `${entry.name.substring(0, 50)}...`;
          }
        }

        this.userAgentMetrics = rightAmount;
        this.userAgentActive = false;
        this.loading = this.rankActive;
        this.lastUpdated = new Date();
      },
      error: (err) => {
        console.error(err);
      },
    });
  }

  /**
   * Query the country ranks.
   */
  private getCountryRanks(): void {
    this.rankActive = true;
    this.appService.getCountryRanks().subscribe({
      next: (data) => {
        for (const country of data) {
          country.name = `${country.name}  ${this.countryCode2Flag(country.name)}`;
        }
        this.countryRanks = data;
        this.rankActive = false;
        this.loading = this.userAgentActive;
        this.lastUpdated = new Date();
      },
      error: (err) => {
        console.error(err);
      },
    });
  }

  /**
   * Transform a country code to a flag emoji.
   * Seen here: https://dev.to/jorik/country-code-to-flag-emoji-a21
   * @returns The corresponding flag as emoji.
   */
  private countryCode2Flag(countryCode: string): string {
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      // @ts-ignore
      .map((char) => 127397 + char.charCodeAt());
    return String.fromCodePoint(...codePoints);
  }
}
