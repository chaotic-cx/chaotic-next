import { DatePipe } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { PrimeTemplate } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Panel } from '@openng/optimus-ui/panel';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import newsJson from '../../../public/news.json';
import { Message } from './interfaces';

const INITIAL_VISIBLE_NEWS = 3;
const NEWS_INCREMENT = 3;

@Component({
  selector: 'chaotic-newsfeed',
  imports: [DatePipe, Panel, Button, PrimeTemplate, TranslocoDirective, EmptyStateComponent],
  templateUrl: './newsfeed.component.html',
  styleUrl: './newsfeed.component.css',
})
export class NewsfeedComponent {
  // Bundled at build time: the prerendered home already shows the news, so no request is needed.
  readonly newsList: { data: Message; html: string }[] = (newsJson as Message[])
    .filter((item) => item.type === 'message')
    .map((item) => ({ data: item, html: this.entityToHtml(item) }))
    .filter((item) => item.html.length > 0)
    .sort((a, b) => b.data.id - a.data.id);

  // The first items are part of the prerendered page. Only items revealed by "show more" animate in.
  protected readonly initialVisibleNews = INITIAL_VISIBLE_NEWS;

  private readonly visibleCount = signal(INITIAL_VISIBLE_NEWS);

  readonly visibleNews = computed(() => this.newsList.slice(0, this.visibleCount()));

  readonly hasMore = computed(() => this.newsList.length > this.visibleCount());

  protected readonly staggerStep = NEWS_INCREMENT;

  showMore() {
    this.visibleCount.update((count) => count + NEWS_INCREMENT);
  }

  entityToHtml(message: Message): string {
    let returnValue: string;

    if (!message.text) return '';
    if (typeof message.text === 'string') {
      returnValue = message.text;
    } else {
      returnValue = message.text
        .map((item) => {
          if (typeof item === 'string') return item;

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
        })
        .join('');
    }

    return returnValue.replaceAll('\n', '<br>');
  }
}
