import { afterNextRender, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { MEMORIAL_2026_LINK } from '../../memorial/memorial.configs';
import { BANNER_END, BANNER_START, BIRTHDAY_AGE } from '../birthday.config';
import { burstConfetti } from '../confetti';

const DISMISSED_STORAGE_KEY = 'chaotic.birthday2026BannerDismissed';
const CONFETTI_STORAGE_KEY = 'chaotic.birthday2026ConfettiShown';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function storeFlag(key: string): void {
  try {
    localStorage.setItem(key, 'true');
  } catch {
    return;
  }
}

function isBannerWeek(now: Date): boolean {
  return now >= BANNER_START && now < BANNER_END;
}

async function burstConfettiOnce(): Promise<void> {
  const started = await burstConfetti();
  if (!started) return;

  storeFlag(CONFETTI_STORAGE_KEY);
}

@Component({
  selector: 'chaotic-birthday-banner',
  imports: [RouterLink, TranslocoDirective],
  templateUrl: './birthday-banner.component.html',
  styleUrl: './birthday-banner.component.css',
})
export class BirthdayBannerComponent {
  protected readonly age = BIRTHDAY_AGE;
  protected readonly memorialPath = MEMORIAL_2026_LINK.path;
  protected readonly visible = signal(false);

  constructor() {
    afterNextRender(() => {
      if (!isBannerWeek(new Date()) || readFlag(DISMISSED_STORAGE_KEY)) return;

      this.visible.set(true);
      if (readFlag(CONFETTI_STORAGE_KEY)) return;

      void burstConfettiOnce();
    });
  }

  protected dismiss(): void {
    storeFlag(DISMISSED_STORAGE_KEY);
    this.visible.set(false);
  }
}
