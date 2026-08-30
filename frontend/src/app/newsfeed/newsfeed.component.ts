import { CommonModule } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { MessageToastService } from '@garudalinux/core';
import { PrimeTemplate } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Panel } from '@openng/optimus-ui/panel';
import { resourceValue } from '../functions';
import { Message } from './interfaces';

const INITIAL_VISIBLE_NEWS = 3;
const NEWS_INCREMENT = 3;

@Component({
  selector: 'chaotic-newsfeed',
  imports: [CommonModule, Panel, Button, PrimeTemplate],
  templateUrl: './newsfeed.component.html',
  styleUrl: './newsfeed.component.css',
  providers: [MessageToastService],
})
export class NewsfeedComponent {
  private readonly messageToastService = inject(MessageToastService);

  private readonly newsResource = httpResource<Message[]>(() => ({ url: '/news.json' }));

  readonly newsList = computed<{ data: Message; html: string }[]>(() => {
    const news = resourceValue(this.newsResource);
    if (!news) return [];
    return news
      .filter((item) => item.type === 'message')
      .map((item) => ({ data: item, html: this.entityToHtml(item) }))
      .filter((item) => item.html.length > 0)
      .sort((a, b) => b.data.id - a.data.id);
  });

  private readonly visibleCount = signal(INITIAL_VISIBLE_NEWS);

  readonly visibleNews = computed(() => this.newsList().slice(0, this.visibleCount()));

  readonly hasMore = computed(() => this.newsList().length > this.visibleCount());

  protected readonly staggerStep = NEWS_INCREMENT;

  showMore() {
    this.visibleCount.update((count) => count + NEWS_INCREMENT);
  }

  constructor() {
    effect(() => {
      if (this.newsResource.error()) {
        this.messageToastService.error('Error', 'Failed to fetch news');
      }
    });
  }

  entityToHtml(message: Message): string {
    let returnValue: string;

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
                return item.href
                  ? `<a class="text-ctp-mauve" href="${item.href}" target="_blank">${item.text}</a>`
                  : item.text;
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
                return `<a class="text-ctp-mauve" href="https://t.me/${item.text.replace('@', '')}" target="_blank">${item.text}</a>`;
              case 'email':
                return `<a class="text-ctp-mauve" href="mailto:${item.text}">${item.text}</a>`;
              case 'phone_number':
                return `<a class="text-ctp-mauve" href="tel:${item.text}">${item.text}</a>`;
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
