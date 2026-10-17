import {
  afterRenderEffect,
  Component,
  computed,
  type EffectCleanupRegisterFn,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { prefersReducedMotion, setPageSeo } from '../functions';
import { MEMORIAL_2021_LINK, MEMORIAL_2024_LINK } from '../memorial/memorial.configs';
import { injectActiveLanguage } from '../pipes/active-language';
import { BIRTHDAY_AGE, type DatePrecision, FOUNDING_YEAR, TIMELINE, type TimelineEntry } from './birthday.config';
import { BirthdayFastfetchComponent } from './fastfetch/birthday-fastfetch.component';
import { BirthdayShellComponent } from './shell/birthday-shell.component';

interface TimelineItem {
  dateTime: string;
  dateLabel: string;
  textKey: string;
}

interface TimelineYear {
  year: number;
  items: TimelineItem[];
}

type ScrollDirection = -1 | 1;

const SCROLL_EDGE_TOLERANCE = 4;

const DATE_FORMATS: Record<DatePrecision, Intl.DateTimeFormatOptions> = {
  day: { day: 'numeric', month: 'short' },
  month: { month: 'long' },
};

// Titles of the terminal windows. They are paths, so they are not translated.
const TERMINAL = {
  fastfetchTitle: '~',
  shellTitle: 'chaotic@aur: ~',
};

function entryYear(entry: TimelineEntry): number {
  return Number(entry.date.slice(0, 4));
}

/**
 * Parses the ISO date as local time, so the label never shifts to the day before.
 */
function entryDate(entry: TimelineEntry): Date {
  const [year, month = 1, day = 1] = entry.date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dateFormatters(language: string): Record<DatePrecision, Intl.DateTimeFormat> {
  return {
    day: new Intl.DateTimeFormat(language, DATE_FORMATS.day),
    month: new Intl.DateTimeFormat(language, DATE_FORMATS.month),
  };
}

/**
 * Groups the entries by year. The input order is kept inside each year.
 */
function groupByYear(entries: TimelineEntry[], language: string): TimelineYear[] {
  const formatters = dateFormatters(language);
  const years = new Map<number, TimelineItem[]>();
  for (const entry of entries) {
    const year = entryYear(entry);
    const items = years.get(year) ?? [];
    const dateLabel = formatters[entry.precision].format(entryDate(entry));
    items.push({ dateTime: entry.date, dateLabel, textKey: entry.textKey });
    years.set(year, items);
  }

  const groups: TimelineYear[] = [];
  for (const [year, items] of years) {
    groups.push({ year, items });
  }

  return groups;
}

@Component({
  selector: 'chaotic-birthday',
  imports: [BirthdayFastfetchComponent, BirthdayShellComponent, RouterLink, TranslocoDirective],
  templateUrl: './birthday.component.html',
  styleUrl: './birthday.component.css',
})
export class BirthdayComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);
  private readonly language = injectActiveLanguage();

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly years = viewChild<ElementRef<HTMLElement>>('years');

  protected readonly age = BIRTHDAY_AGE;
  protected readonly foundingYear = FOUNDING_YEAR;
  protected readonly currentYear = FOUNDING_YEAR + BIRTHDAY_AGE;
  protected readonly terminal = TERMINAL;
  protected readonly memorialLinks = [MEMORIAL_2024_LINK, MEMORIAL_2021_LINK];

  protected readonly atStart = signal(true);
  protected readonly atEnd = signal(false);

  protected readonly timeline = computed(() => groupByYear(TIMELINE, this.language()));

  constructor() {
    const routeTitleKey = this.route.snapshot.title ?? '';
    setPageSeo(
      this.transloco.translate('routes.titleFormat', { page: this.transloco.translate(routeTitleKey) }),
      this.transloco.translate('memorial.edition2026.description'),
      this.transloco.translate('memorial.edition2026.keywords'),
    );

    afterRenderEffect((onCleanup) => this.observeScrollerSize(onCleanup));
  }

  private observeScrollerSize(onCleanup: EffectCleanupRegisterFn): void {
    const scroller = this.scroller()?.nativeElement;
    const years = this.years()?.nativeElement;
    if (!scroller || !years) return;

    const observer = new ResizeObserver(() => this.updateScrollEdges());
    observer.observe(scroller);
    observer.observe(years);
    onCleanup(() => observer.disconnect());
  }

  protected updateScrollEdges(): void {
    const element = this.scroller()?.nativeElement;
    if (!element) return;

    const maxScroll = element.scrollWidth - element.clientWidth;
    this.atStart.set(element.scrollLeft <= SCROLL_EDGE_TOLERANCE);
    this.atEnd.set(element.scrollLeft >= maxScroll - SCROLL_EDGE_TOLERANCE);
  }

  protected scrollYears(direction: ScrollDirection): void {
    const element = this.scroller()?.nativeElement;
    if (!element) return;

    const column = element.querySelector<HTMLElement>('.birthday-year');
    const columnWidth = column?.offsetWidth ?? element.clientWidth;
    const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
    element.scrollBy({ left: direction * columnWidth, behavior });
  }
}
