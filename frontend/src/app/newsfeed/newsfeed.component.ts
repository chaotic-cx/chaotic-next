import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppService } from '../app.service';
import { TableModule } from 'primeng/table';
import { Fieldset } from 'primeng/fieldset';
import { ScrollPanel } from 'primeng/scrollpanel';
import { MessageToastService } from '@garudalinux/core';
import { Message } from './interfaces';
import { entityToHtml } from '../functions';
import { BreakpointObserver } from '@angular/cdk/layout';

@Component({
  selector: 'chaotic-newsfeed',
  imports: [CommonModule, TableModule, Fieldset, ScrollPanel],
  templateUrl: './newsfeed.component.html',
  styleUrl: './newsfeed.component.css',
  providers: [MessageToastService],
})
export class NewsfeedComponent implements OnInit {
  isWide = signal<boolean>(true);
  newsList: { data: Message; html?: string }[] = [];

  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly observer = inject(BreakpointObserver);

  async ngOnInit(): Promise<void> {
    this.observer.observe('(min-width: 768px)').subscribe((result) => {
      this.isWide.set(result.matches);
    });

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
