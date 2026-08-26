import { Component, computed, signal } from '@angular/core';

const MIN_THUMB_PX = 40;
const HIDE_DELAY_MS = 1000;

const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

@Component({
  selector: 'chaotic-overlay-scrollbar',
  templateUrl: './overlay-scrollbar.component.html',
  styleUrl: './overlay-scrollbar.component.css',
  host: {
    '(window:scroll)': 'refresh()',
    '(window:resize)': 'refresh()',
    '(window:pointermove)': 'onPointerMove($event)',
    '(window:pointerup)': 'onPointerUp()',
  },
})
export class OverlayScrollbarComponent {
  private readonly hasFinePointer = window.matchMedia(FINE_POINTER_QUERY).matches;

  private readonly scrollTop = signal(0);
  private readonly scrollHeight = signal(0);
  private readonly viewportHeight = signal(0);

  private readonly dragging = signal(false);
  private readonly active = signal(false);
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private dragStartOffset = 0;

  protected readonly scrollable = computed(
    () => this.scrollHeight() > this.viewportHeight() && this.viewportHeight() > 0,
  );

  protected readonly visible = computed(() => this.active() || this.dragging());

  protected readonly thumbHeight = computed(() => {
    const ratio = this.viewportHeight() / Math.max(1, this.scrollHeight());
    return Math.max(MIN_THUMB_PX, Math.round(this.viewportHeight() * ratio));
  });

  protected readonly thumbTop = computed(() => {
    const maxScroll = Math.max(1, this.scrollHeight() - this.viewportHeight());
    const travel = this.viewportHeight() - this.thumbHeight();
    return Math.round((this.scrollTop() / maxScroll) * travel);
  });

  protected refresh(): void {
    if (!this.hasFinePointer) return;
    this.scrollTop.set(window.scrollY);
    this.scrollHeight.set(document.documentElement.scrollHeight);
    this.viewportHeight.set(window.innerHeight);
    if (!this.dragging()) {
      this.showUntilIdle();
    }
  }

  protected onThumbPointerDown(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragging.set(true);
    this.dragStartOffset = event.clientY - this.thumbTop();
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.dragging()) return;
    const travel = this.viewportHeight() - this.thumbHeight();
    if (travel <= 0) return;
    const ratio = (event.clientY - this.dragStartOffset) / travel;
    const maxScroll = this.scrollHeight() - this.viewportHeight();
    window.scrollTo({ top: ratio * maxScroll });
  }

  protected onPointerUp(): void {
    if (!this.dragging()) return;
    this.dragging.set(false);
    this.showUntilIdle();
  }

  protected onTrackPointerDown(event: PointerEvent): void {
    const travel = this.viewportHeight() - this.thumbHeight();
    if (travel <= 0) return;
    const ratio = (event.clientY - this.thumbHeight() / 2) / travel;
    const maxScroll = this.scrollHeight() - this.viewportHeight();
    window.scrollTo({ top: Math.min(1, Math.max(0, ratio)) * maxScroll, behavior: 'smooth' });
  }

  private showUntilIdle(): void {
    this.active.set(true);
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
    }
    this.hideTimer = setTimeout(() => this.active.set(false), HIDE_DELAY_MS);
  }
}
