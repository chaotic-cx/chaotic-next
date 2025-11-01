import { inject, Injectable, signal } from '@angular/core';
import { retry } from 'rxjs';
import { Build } from '@./shared-lib';
import { AppService } from '../app.service';
import { MessageToastService } from '@garudalinux/core';
import { OutcomePipe } from '../pipes/outcome.pipe';

@Injectable({
  providedIn: 'root',
})
export class DeployLogService {
  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);

  packageList = signal<Build[]>([]);

  readonly loading = signal<boolean>(true);
  readonly searchValue = signal<string>('');
  readonly amount = signal<number>(4000);

  getDeployments(isRefresh = false): void {
    const outcomePipe = new OutcomePipe();

    this.appService
      .getPackageBuilds(this.amount())
      .pipe(retry({ delay: 5000, count: 3 }))
      .subscribe({
        next: (data: Build[]) => {
          data.map((build) => {
            build.statusText = outcomePipe.transform(build.status);
            // Logs expire after 7 days of being stored inside Redis
            if (new Date(build.timestamp).getTime() + 7 * 24 * 60 * 60 * 1000 < Date.now()) {
              build.logUrl = 'purged';
            }
            return build;
          });
          this.packageList.set(data);
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to fetch package list');
          console.error(err);
        },
        complete: () => {
          this.loading.set(false);
        },
      });
  }
}
