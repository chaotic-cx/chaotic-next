import {
    CACHE_TELEGRAM_TTL,
    type DeploymentList,
    DeploymentType,
    Repository,
    RepositoryList,
    TgMessageList,
} from "@./shared-lib";
import { AfterViewInit, ChangeDetectorRef, Component } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { AppService } from "../app.service";
import { generateRepoUrl, getDeployments, parseDeployments, startShortPolling } from "../functions";
import { ToastComponent } from "../toast/toast.component";
import { TitleCasePipe, UpperCasePipe } from "@angular/common";

@Component({
    selector: "app-deploy-log-full",
    standalone: true,
    imports: [FormsModule, RouterLink, ToastComponent, UpperCasePipe, TitleCasePipe],
    templateUrl: "./deploy-log-full.component.html",
    styleUrl: "./deploy-log-full.component.css",
})
export class DeployLogFullComponent implements AfterViewInit {
    protected readonly Repository = Repository;
    currentType: DeploymentType = DeploymentType.ALL;
    isFiltered = false;
    latestDeployments: DeploymentList = [];
    loading = true;
    logAmount: number | undefined;
    repo: RepositoryList = "all";
    searchterm: string | undefined;
    showToast = false;
    shownDeployments: DeploymentList = [];
    toastId!: number;
    toastText = "";

    constructor(
        private appService: AppService,
        private cdr: ChangeDetectorRef,
    ) {}

    async ngAfterViewInit(): Promise<void> {
        await this.updateLogAmount(100);
        void this.showDeployments();

        // Poll for new deployments every 30 seconds (which is the time the backend caches requests)
        startShortPolling(CACHE_TELEGRAM_TTL, async () => {
            await this.updateLogAmount(this.logAmount ?? 100);
            void this.showDeployments();
        });
    }

    /**
     * Update the list/number of deployments to show.
     * @param amount The number of deployments to request from the backend
     */
    async updateLogAmount(amount: number): Promise<void> {
        this.loading = true;
        const newDeployments: TgMessageList = await getDeployments(
            amount,
            this.currentType,
            this.appService,
            this.repo,
        );

        if (newDeployments === null) {
            this.loading = false;
            return;
        }

        this.latestDeployments = parseDeployments(newDeployments, this.currentType);

        // Parse the strings for the UI and write them to the list
        this.constructStrings();
        this.cdr.detectChanges();
        this.loading = false;
    }

    /**
     * Check for whether input is a valid number.
     */
    async getNewAmount(): Promise<void> {
        if (this.logAmount !== undefined) {
            if (/^[0-9]*$/.test(this.logAmount.toString()) && this.logAmount <= 2000) {
                await this.updateLogAmount(this.logAmount);
                void this.showDeployments();
            } else if (this.logAmount > 2000) {
                this.toastText = "Won't fetch more than 2000 messages to not overload the backend!";
                this.showToast = true;
                setTimeout(() => {
                    this.showToast = false;
                }, 5000);
                this.loading = false;
            } else {
                this.toastText = "Please enter a valid number!";
                this.showToast = true;
                setTimeout(() => {
                    this.showToast = false;
                }, 5000);
                this.loading = false;
            }
        } else {
            await this.updateLogAmount(100);
            void this.showDeployments();
        }
    }

    /**
     * Construct strings to show in the UI for all currently loaded deployments.
     */
    constructStrings(): void {
        for (const index in this.latestDeployments) {
            switch (this.latestDeployments[index].type) {
                case DeploymentType.SUCCESS:
                    this.latestDeployments[index].string = "Deployed";
                    break;
                case DeploymentType.FAILED:
                    this.latestDeployments[index].string = "Failed deploying";
                    break;
                case DeploymentType.TIMEOUT:
                    this.latestDeployments[index].string = "Timed out during deployment of";
                    break;
                case DeploymentType.CLEANUP:
                    this.latestDeployments[index].string = "Cleanup job ran for";
                    break;
                default:
                    this.latestDeployments[index].string = "Unknown status for";
                    break;
            }

            // Add source URL
            this.latestDeployments[index].sourceUrl = generateRepoUrl(this.latestDeployments[index]);
        }
    }

    /**
     * Change the deployment type to query. Certainly not a very fancy way, but works for now.
     * @param $event
     */
    changeDeploymentType($event: Event): void {
        const target = $event.target as HTMLSelectElement;
        this.loading = true;

        switch (target.value) {
            case "0":
                this.currentType = DeploymentType.ALL;
                break;
            case "1":
                this.currentType = DeploymentType.SUCCESS;
                break;
            case "2":
                this.currentType = DeploymentType.FAILED;
                break;
            case "3":
                this.currentType = DeploymentType.TIMEOUT;
                break;
        }
        void this.getNewAmount();
    }

    /**
     * Show deployments based on the current search term (if any). Shows all deployments if no search term is present.
     */
    async showDeployments(): Promise<void> {
        if (this.searchterm && this.searchterm !== "" && !this.isFiltered) {
            this.shownDeployments = this.latestDeployments.filter((deployment) => {
                return deployment.name.toLowerCase().includes(this.searchterm?.toLowerCase() ?? "");
            });

            if (this.shownDeployments.length > 0) {
                return;
            }

            // If we have no results, we need to fetch more
            this.loading = true;
            let resultAmount = this.logAmount ? this.logAmount * 2 : 200;
            while (this.shownDeployments.length === 0) {
                await this.updateLogAmount(resultAmount);
                this.shownDeployments = this.latestDeployments.filter((deployment) => {
                    return deployment.name.toLowerCase().includes(this.searchterm?.toLowerCase() ?? "");
                });

                // This is when we abort the mission
                if (resultAmount === 2000) {
                    break;
                }

                // Otherwise, keep trying. A correct max of 2000 is set to not overload the backend.
                if (resultAmount * 2 > 2000) {
                    resultAmount = 2000;
                } else {
                    resultAmount *= 2;
                }
            }
            this.isFiltered = true;
            this.loading = false;
        } else if (this.searchterm && this.searchterm !== "" && this.isFiltered) {
            // We are already filtering, so we need it to filter the full list again
            this.shownDeployments = this.latestDeployments.filter((deployment) => {
                return deployment.name.toLowerCase().includes(this.searchterm?.toLowerCase() ?? "");
            });
            this.isFiltered = false;
        } else {
            // None of the previous cases applied, we need to show all logs
            this.shownDeployments = this.latestDeployments;
        }

        if (
            (this.searchterm !== "" &&
                !this.isFiltered &&
                this.logAmount === undefined &&
                this.shownDeployments.length < 100) ||
            (this.logAmount !== undefined && this.shownDeployments.length < this.logAmount)
        ) {
            this.toastText = `You requested too many. ${this.shownDeployments.length === 0 ? "No results are available" : `Showing the available amount of ${this.shownDeployments.length} instead`}.
            This is currently expected as we just migrated to infra 4.0 and log channel is building up new history.`;

            if (this.showToast) clearTimeout(this.toastId);
            this.showToast = true;
            this.toastId = setTimeout(
                () => {
                    this.showToast = false;
                },
                5000,
                "deploy-log-full-toast",
            );
        }

        this.loading = false;
    }

    async selectSpecificRepo(repo: string): Promise<void> {
        this.repo = repo as RepositoryList;
        await this.getNewAmount();
    }
}
