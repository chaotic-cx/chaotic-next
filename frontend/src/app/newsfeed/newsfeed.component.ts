import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppService } from '../app.service';
import { retry } from 'rxjs';
import { TgMessageList } from '@./shared-lib';
import { TableModule } from 'primeng/table';
import { Fieldset } from 'primeng/fieldset';
import { TruncatePipe } from '../pipes/truncate.pipe';
import { ScrollPanel } from 'primeng/scrollpanel';
import { MessageToastService } from '@garudalinux/core';

@Component({
  selector: 'chaotic-newsfeed',
  imports: [CommonModule, TableModule, Fieldset, TruncatePipe, ScrollPanel],
  templateUrl: './newsfeed.component.html',
  styleUrl: './newsfeed.component.css',
  providers: [MessageToastService],
})
export class NewsfeedComponent implements OnInit {
  newsList: TgMessageList = [];
  loading = true;

  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);

  async ngOnInit(): Promise<void> {
    this.appService
      .getNews()
      .pipe(retry({ delay: 2000 }))
      .subscribe({
        next: (data) => {
          this.newsList = data;
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to fetch news');
          console.error(err);
        },
        complete: () => {
          this.loading = false;
        },
      });
  }
}
