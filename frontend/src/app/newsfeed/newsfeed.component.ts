import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { MessageToastService } from '@garudalinux/core';
import { Fieldset } from 'primeng/fieldset';
import { ScrollPanel } from 'primeng/scrollpanel';
import { TableModule } from 'primeng/table';
import { AppService } from '../app.service';
import { Message } from './interfaces';

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
          const html: string = this.entityToHtml(news);
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

  /**
   * Convert the entity object of a Telegram message to HTML.
   * @param message The Telegram message to convert.
   * @returns A string containing the message as HTML.
   */
  entityToHtml(message: Message): string {
    let returnValue = '';
    if (!message.text) {
      return '';
    } else if (typeof message.text === 'string') {
      returnValue = message.text;
    } else {
      returnValue = message.text
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          } else {
            switch (item.type) {
              case 'text_link':
                return `<a class="text-mauve" href="${item.href}" target="_blank">${item.text}</a>`;
              case 'bold':
                return `<strong>${item.text}</strong>`;
              case 'code':
                return `<code>${item.text}</code>`;
              case 'italic':
                return `<em>${item.text}</em>`;
              case 'pre':
                return `<pre>${item.text}</pre>`;
              case 'strikethrough':
                return `<s>${item.text}</s>`;
              case 'underline':
                return `<u>${item.text}</u>`;
              case 'mention':
                return `<a class="text-mauve" href="https://t.me/${item.text.replace('@', '')}" target="_blank">${item.text}</a>`;
              case 'email':
                return `<a class="text-mauve" href="mailto:${item.text}">${item.text}</a>`;
              case 'phone_number':
                return `<a class="text-mauve" href="tel:${item.text}">${item.text}</a>`;
              default:
                return item.text;
            }
          }
        })
        .join('');
    }
    return returnValue.replaceAll('\n', '<br>');
  }
}
