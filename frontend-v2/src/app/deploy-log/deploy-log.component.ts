import { AfterViewInit, Component, inject, OnInit, signal, ViewChild } from '@angular/core';
import { Table, TableModule } from 'primeng/table';
import { AppService } from '../app.service';
import { CommonModule } from '@angular/common';
import { retry } from 'rxjs';
import { Button } from 'primeng/button';
import { InputIcon } from 'primeng/inputicon';
import { IconField } from 'primeng/iconfield';
import { InputText } from 'primeng/inputtext';
import { Build } from '@./shared-lib';
import { OutcomePipe } from '../pipes/outcome.pipe';
import { LogurlPipe } from '../pipes/logurl.pipe';
import { DurationPipe } from '../pipes/duration.pipe';
import { MessageToastService } from '@garudalinux/core';
import { TitleComponent } from '../title/title.component';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'chaotic-deploy-log',
  imports: [
    CommonModule,
    TableModule,
    Button,
    InputIcon,
    IconField,
    InputText,
    LogurlPipe,
    DurationPipe,
    TitleComponent,
  ],
  templateUrl: './deploy-log.component.html',
  styleUrl: './deploy-log.component.css',
  providers: [MessageToastService, OutcomePipe],
})
export class DeployLogComponent implements OnInit, AfterViewInit {
  packageList: Build[] = [];
  loading = true;
  searchValue = signal<string>('');
  amount = signal<number>(4000);
  outcomePipe = inject(OutcomePipe);

  @ViewChild('deployTable') deployTable!: Table;

  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  ngOnInit() {
    this.appService
      .getPackageBuilds(this.amount())
      .pipe(retry({ delay: 2000 }))
      .subscribe({
        next: (data: Build[]) => {
          data.map((build) => {
            build.statusText = this.outcomePipe.transform(build.status);
            // Logs expire after 7 days of being stored inside Redis
            if (new Date(build.timestamp).getTime() + 7 * 24 * 60 * 60 * 1000 < Date.now()) {
              build.logUrl = 'purged';
            }
            return build;
          });
          this.packageList = data;
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to fetch package list');
          console.error(err);
        },
        complete: () => {
          this.loading = false;
        },
      });
  }

  ngAfterViewInit() {
    if (this.route.snapshot.queryParams['search']) {
      this.deployTable.filterGlobal(this.route.snapshot.queryParams['search'], 'contains');
      this.searchValue.set(this.route.snapshot.queryParams['search']);
    }
  }

  clear(table: Table) {
    table.clear();
    this.searchValue.set('');
    void this.router.navigate([], { queryParams: { search: '' } });
  }

  globalFilter(target: EventTarget | null) {
    if (!target) return;
    const input = target as HTMLInputElement;
    this.deployTable.filterGlobal(input.value, 'contains');
    void this.router.navigate([], { queryParams: { search: input.value } });
  }

  typed(value: any): Build {
    return value;
  }
}
