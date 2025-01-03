import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppService } from '../app.service';
import { TableModule } from 'primeng/table';
import { Fieldset } from 'primeng/fieldset';
import { ScrollPanel } from 'primeng/scrollpanel';
import { MessageToastService } from '@garudalinux/core';
import { Message } from './interfaces';
import { entityToHtml } from '../functions';

@Component({
  selector: 'chaotic-newsfeed',
  imports: [CommonModule, TableModule, Fieldset, ScrollPanel],
  templateUrl: './newsfeed.component.html',
  styleUrl: './newsfeed.component.css',
  providers: [MessageToastService],
})
export class NewsfeedComponent implements OnInit {
  newsList: { data: Message; html?: string }[] = [];

  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);

  async ngOnInit(): Promise<void> {
    this.appService.getNews().subscribe({
      next: (data) => {
        for (const news of data) {
          if (news.type !== 'message') continue;
          const html = entityToHtml(news);
          if (!html) continue;
          this.newsList.push({ data: news, html: html });
        }
        this.newsList.sort((a, b) => {
          return b.data.id - a.data.id;
        });
      },
      error: (err) => {
        this.messageToastService.error('Error', 'Failed to fetch news');
        console.error(err);
      },
    });
  }
}
