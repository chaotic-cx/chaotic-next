import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Inject,
  Input,
  OnDestroy,
  PLATFORM_ID,
  QueryList,
  signal,
  ViewChild,
  ViewChildren,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Dot } from '@omnedia/ngx-map';
import { prerenderedMap } from './pre-rendered';

@Component({
  selector: 'om-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ngx-map.component.html',
  styleUrl: './ngx-map.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgxMapComponent implements AfterViewInit, OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly platformId = inject(PLATFORM_ID);

  @ViewChild('OmMap', { static: true })
  container!: ElementRef<HTMLDivElement>;

  @ViewChildren('animatedPath') animatedPaths!: QueryList<ElementRef<SVGPathElement>>;

  @ViewChildren('animatedPathAnimation') animations!: QueryList<ElementRef<SVGAnimationElement>>;

  @Input()
  styleClass: string | undefined;

  @Input('dots')
  set updateDots(dots: Dot[]) {
    dots = dots.map((dot, index) => {
      dot.animationStart = `${this.getRandomDelay()}; omMapPathAnimation${index}.end+${this.getRandomDelay()}`;
      return dot;
    });

    this.dots.set(dots);
  }

  dots = signal<Dot[]>([]);

  @Input()
  lineColor = '#0ea5e9';

  @Input('backgroundColor')
  set updateBackgroundColor(color: string) {
    this.backgroundColor = color;
  }

  backgroundColor?: string;

  @Input('mapColor')
  set updateMapColor(color: string) {
    this.mapColor = color;
  }

  mapColor = 'rgba(0,0,0,0.40)';

  @Input('mapDotsShape')
  set updateMapDotsShape(shape: 'circle' | 'hexagon') {
    this.mapDotsShape = shape;
  }

  mapDotsShape: 'circle' | 'hexagon' = 'circle';

  @Input('mapDotsRadius')
  set updateMapDotsRadius(radius: number) {
    this.mapDotsRadius = radius;
  }

  mapDotsRadius = 0.22;

  @Input()
  animated = false;

  svgMap = signal<SafeHtml>(this.sanitizer.bypassSecurityTrustHtml(prerenderedMap));

  private pathLengths: Map<number, number> = new Map();

  private intersectionObserver?: IntersectionObserver;
  private hasInitializedObserver = false;
  isInView = signal(false);
  private mapGenerationTimeout?: number;

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId) && !this.hasInitializedObserver) {
      this.hasInitializedObserver = true;
      this.intersectionObserver = new IntersectionObserver(([entry]) => {
        const wasInView = this.isInView();
        this.isInView.set(entry.isIntersecting);

        if (this.isInView() && !wasInView) {
          this.triggerAnimations();
        }
      });
      this.intersectionObserver.observe(this.container.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.intersectionObserver?.disconnect();
  }

  projectPoint(lat: number, lng: number) {
    const x = (lng + 180) * (800 / 360);
    const y = (90 - lat) * (400 / 180);
    return { x, y };
  }

  createCurvedPath(start: { x: number; y: number }, end: { x: number; y: number }) {
    const midX = (start.x + end.x) / 2;
    const midY = Math.min(start.y, end.y) - 50;
    return `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
  }

  getPathLength(index: number): number {
    if (!this.pathLengths.has(index)) {
      const pathElement = this.animatedPaths?.toArray()[index]?.nativeElement;
      if (pathElement) {
        this.pathLengths.set(index, pathElement.getTotalLength());
      }
    }
    return this.pathLengths.get(index)!;
  }

  getRandomDelay(): string {
    return `${((Math.random() + 1) * 2).toFixed(2)}s`;
  }

  private triggerAnimations(): void {
    this.animations.forEach((animation, index) => {
      const element = animation.nativeElement;

      element.setAttribute('fill', 'remove');
      setTimeout(() => {
        element.setAttribute('fill', 'freeze');
        element.beginElement();
      }, index * 500);
    });
  }
}
