import { BreakpointObserver } from '@angular/cdk/layout';
import { httpResource } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MessageToastService } from '@garudalinux/core';
import { Fieldset } from '@openng/optimus-ui/fieldset';
import { ScrollPanel } from '@openng/optimus-ui/scrollpanel';
import { TableModule } from '@openng/optimus-ui/table';
import { AppService } from '../app.service';
import { Message } from './interfaces';

@Component({
  selector: 'chaotic-newsfeed',
  imports: [CommonModule, TableModule, Fieldset, ScrollPanel],
  templateUrl: './newsfeed.component.html',
  styleUrl: './newsfeed.component.css',
  providers: [MessageToastService],
})
export class NewsfeedComponent {
  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly messageToastService = inject(MessageToastService);
  private readonly observer = inject(BreakpointObserver);

  private readonly newsResource = httpResource<Message[]>(() => this.appService.getNewsResourceRequest());

  readonly isWide = signal<boolean>(true);

  readonly newsList = computed<{ data: Message; html: string }[]>(() => {
    const news = this.newsResource.value();
    if (!news) return [];
    return news
      .filter((item) => item.type === 'message')
      .map((item) => ({ data: item, html: this.entityToHtml(item) }))
      .filter((item) => item.html.length > 0)
      .sort((a, b) => b.data.id - a.data.id);
  });

  constructor() {
    effect(() => {
      if (this.newsResource.error()) {
        this.messageToastService.error('Error', 'Failed to fetch news');
      }
    });

    this.observer
      .observe('(min-width: 768px)')
      .pipe(takeUntilDestroyed())
      .subscribe((result) => {
        this.isWide.set(result.matches);
        this.cdr.markForCheck();
      });
  }

  /**
   * Convert the entity object of a Telegram message to HTML.
   * @param message The Telegram message to convert.
   * @returns A string containing the message as HTML.
   */
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
