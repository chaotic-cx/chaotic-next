import { CACHE_TELEGRAM_TTL, type DeploymentList, DeploymentType } from '@./shared-lib';
import { AfterViewInit, ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppService } from '../app.service';
import { generateRepoUrl, getDeployments, parseDeployments, startShortPolling } from '../functions';

@Component({
  selector: 'app-deploy-log',
  imports: [FormsModule],
  templateUrl: './deploy-log.component.html',
  styleUrl: './deploy-log.component.css',
})
export class DeployLogComponent implements AfterViewInit {
  latestDeployments: DeploymentList = [];

  constructor(
    private appService: AppService,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngAfterViewInit(): Promise<void> {
    this.latestDeployments = parseDeployments(
      await getDeployments(30, DeploymentType.SUCCESS, this.appService, 'all'),
      DeploymentType.SUCCESS,
    );
    for (const deployment of this.latestDeployments) {
      deployment.sourceUrl = generateRepoUrl(deployment);
    }

    // Poll for new deployments every 5 minutes (which is the time the backend caches requests)
    startShortPolling(CACHE_TELEGRAM_TTL, async () => {
      await this.checkNewDeployments();
      for (const deployment of this.latestDeployments) {
        deployment.sourceUrl = generateRepoUrl(deployment);
      }
    });
  }

  /**
   * Check for new deployments and update the list.
   */
  async checkNewDeployments(): Promise<void> {
    const newList: DeploymentList = parseDeployments(
      await getDeployments(30, DeploymentType.SUCCESS, this.appService, 'all'),
      DeploymentType.SUCCESS,
    );
    if (newList[0].date !== this.latestDeployments[0].date) {
      this.latestDeployments = newList;
    }
    this.cdr.detectChanges();
  }
}
