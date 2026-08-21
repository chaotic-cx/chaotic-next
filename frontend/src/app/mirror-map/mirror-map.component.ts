import { Component, computed, effect, ElementRef, input, OnDestroy, viewChild } from '@angular/core';
import type { Mirror, MirrorSelf } from '@chaotic-next/shared-lib';
import { Map as MaplibreMap, Marker, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import * as turf from '@turf/turf';

const WORKER_URL = '/maplibre-gl-worker.mjs';

const STYLE_URL = 'https://demotiles.maplibre.org/globe.json';
const CIRCLE_SOURCE_ID = 'circles';
const CIRCLE_FILL_LAYER_ID = 'circles-layer';
const CIRCLE_OUTLINE_LAYER_ID = 'circles-outline';
const CIRCLE_COLOR = '#cba6f7';
const CIRCLE_RADIUS_KM = 2414.016;
const CIRCLE_STEPS = 128;
const FOCUS_ZOOM = 3;
const FOCUS_SPEED = 1.2;

const MARKER_COLORS = {
  active: '#cba6f7',
  healthy: '#a6e3a1',
  down: '#f38ba8',
} as const;

type MirrorStatus = keyof typeof MARKER_COLORS;

function mirrorStatus(mirror: Mirror): MirrorStatus {
  return mirror.geo_active ? 'active' : mirror.healthy ? 'healthy' : 'down';
}

const STATUS_LABELS: Record<MirrorStatus, string> = {
  active: 'Active',
  healthy: 'Healthy',
  down: 'Down',
};

function mirrorPopupHtml(mirror: Mirror, status: MirrorStatus): string {
  const lastUpdate = new Date(mirror.last_update).toLocaleString('en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC',
  });
  return `
    <b>${mirror.subdomain}</b>
    <span style="opacity: 0.7">| ${STATUS_LABELS[status]}</span>
    ${mirror.official ? '<i class="pi pi-verified" style="color: #89b4fa" title="Official mirror"></i>' : ''}
    <br />
    <a href="https://${mirror.subdomain}.chaotic.cx" target="_blank" rel="noopener" tabindex="-1">${mirror.subdomain}.chaotic.cx</a>
    <br />
    <span style="opacity: 0.7">Last update: ${lastUpdate} UTC</span>
  `;
}

function markerPosition(mirror: Mirror, self: MirrorSelf | undefined): [number, number] | null {
  const rawLatLon = mirror.geo_active && self?.latlon ? self.latlon : mirror.latlon;
  if (!rawLatLon) return null;
  const position: [number, number] = [rawLatLon[1], rawLatLon[0]];
  return isValidPosition(position) ? position : null;
}

function isValidPosition(position: [number, number] | null): position is [number, number] {
  if (!position) return false;
  const [lng, lat] = position;
  return Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
}

function samePosition(a: [number, number], b: [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

@Component({
  selector: 'chaotic-mirror-map',
  host: {
    '[class.fill-height]': 'fillHeight()',
  },
  template: `
    <div class="mirror-map" #mapDiv></div>
    <div class="stats">
      <div class="stat-item">
        <span class="stat-dot" style="background:#cba6f7"></span>
        <span class="stat-label">Active</span>
        <span class="stat-count">{{ counts().active }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-dot" style="background:#a6e3a1"></span>
        <span class="stat-label">Healthy</span>
        <span class="stat-count">{{ counts().healthy }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-dot" style="background:#f38ba8"></span>
        <span class="stat-label">Down</span>
        <span class="stat-count">{{ counts().down }}</span>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        position: relative;
        display: block;
        width: 100%;
        height: 24rem;
        border-radius: 12px;
        overflow: hidden;
      }

      :host.fill-height {
        height: auto;
        flex: 1 1 0%;
      }

      @media (max-width: 640px) {
        :host {
          height: 16rem;
        }

        .stats {
          padding: 8px 10px;
          font-size: 12px;
        }
      }

      .mirror-map {
        position: absolute;
        inset: 0;
        background-color: transparent;
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
      }

      :host ::ng-deep .maplibregl-ctrl-group {
        background: rgba(24, 24, 37, 0.85) !important;
        backdrop-filter: blur(10px) !important;
        -webkit-backdrop-filter: blur(10px) !important;
        border: 1px solid #313244 !important;
        border-radius: 12px !important;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4) !important;
        color: #cdd6f4 !important;
        overflow: hidden;
      }

      :host ::ng-deep .maplibregl-ctrl-group .maplibregl-ctrl-icon {
        filter: invert(1);
      }

      :host ::ng-deep .maplibregl-ctrl-attrib {
        display: none !important;
      }

      :host ::ng-deep .maplibregl-popup {
        z-index: 30 !important;
      }

      :host ::ng-deep .maplibregl-popup-content {
        background-color: #181825 !important;
        color: #cdd6f4 !important;
        border-radius: 12px !important;
        padding: 10px 14px !important;
        border: 1px solid #313244 !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5) !important;
        font-weight: 500;
        font-size: 12px;
        line-height: 1.6;
      }

      :host ::ng-deep .maplibregl-popup-content a {
        color: var(--ctp-mocha-mauve);
        text-decoration: none;
        font-weight: 600;
      }

      :host ::ng-deep .maplibregl-ctrl-group button + button {
        border-top: 1px solid #313244 !important;
      }

      :host ::ng-deep .maplibregl-popup-tip {
        border-top-color: #181825 !important;
        border-bottom-color: #181825 !important;
      }

      :host ::ng-deep .maplibregl-container {
        font-family: Inter, InterVariable, sans-serif !important;
      }

      :host ::ng-deep .maplibregl-canvas-container.maplibregl-interactive {
        filter: saturate(1.2) contrast(1.1);
      }

      @keyframes pulse {
        0% {
          transform: scale(1);
          opacity: 1;
        }
        50% {
          transform: scale(1.2);
          opacity: 0.8;
        }
        100% {
          transform: scale(1);
          opacity: 1;
        }
      }

      :host ::ng-deep .marker-active svg {
        animation: pulse 2s infinite ease-in-out;
        transform-origin: bottom;
      }

      .stats {
        position: absolute;
        bottom: 25px;
        left: 25px;
        background: rgba(24, 24, 37, 0.85);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid #313244;
        border-radius: 12px;
        padding: 12px 16px;
        color: #cdd6f4;
        font-size: 13px;
        pointer-events: none;
        z-index: 10;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
      }

      .stat-item {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 6px;
      }

      .stat-item:last-child {
        margin-bottom: 0;
      }

      .stat-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }

      .stat-label {
        font-weight: 500;
        opacity: 0.8;
      }

      .stat-count {
        font-weight: 700;
        margin-left: auto;
      }
    `,
  ],
})
export class MirrorMapComponent implements OnDestroy {
  readonly mirrors = input<Mirror[]>([]);
  readonly self = input<MirrorSelf | undefined>(undefined);
  readonly focus = input<[number, number] | null>(null);
  readonly fillHeight = input(false);

  private readonly mapDiv = viewChild<ElementRef<HTMLDivElement>>('mapDiv');

  private map?: MaplibreMap;
  private readonly markers = new Map<string, Marker>();
  private resizeObserver?: ResizeObserver;
  private lastFocus: [number, number] | null = null;

  readonly counts = computed(() => {
    const counts = { active: 0, healthy: 0, down: 0 };
    for (const mirror of this.mirrors()) {
      counts[mirrorStatus(mirror)]++;
    }
    return counts;
  });

  constructor() {
    effect(() => {
      const div = this.mapDiv();
      if (div && !this.map) {
        this.initMap(div.nativeElement);
      }
      if (this.map?.isStyleLoaded()) {
        this.updateMap();
      }
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  private initMap(container: HTMLDivElement): void {
    setWorkerUrl(WORKER_URL);

    this.map = new MaplibreMap({
      container,
      style: STYLE_URL,
      center: [0, 30],
      zoom: 0.5,
      transformRequest: (url: string) => {
        if (url.includes('demotiles.maplibre.org')) {
          const separator = url.includes('?') ? '&' : '?';
          return { url: `${url}${separator}ngsw-bypass=true` };
        }
        return { url };
      },
    });

    this.map.addControl(new NavigationControl(), 'top-right');

    this.resizeObserver = new ResizeObserver(() => this.map?.resize());
    this.resizeObserver.observe(container);

    this.map.on('load', () => {
      this.addCircleLayers();
      this.updateMap();
    });
  }

  private addCircleLayers(): void {
    if (!this.map || this.map.getSource(CIRCLE_SOURCE_ID)) return;

    const emptyData: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    this.map.addSource(CIRCLE_SOURCE_ID, { type: 'geojson', data: emptyData });
    this.map.addLayer({
      id: CIRCLE_FILL_LAYER_ID,
      type: 'fill',
      source: CIRCLE_SOURCE_ID,
      paint: { 'fill-color': CIRCLE_COLOR, 'fill-opacity': 0.1 },
    });
    this.map.addLayer({
      id: CIRCLE_OUTLINE_LAYER_ID,
      type: 'line',
      source: CIRCLE_SOURCE_ID,
      paint: { 'line-color': CIRCLE_COLOR, 'line-width': 1, 'line-opacity': 1.0 },
    });
  }

  private updateMap(): void {
    if (!this.map) return;

    const mirrors = this.mirrors();
    const self = this.self();
    const currentSubdomains = new Set<string>();
    const circleFeatures: GeoJSON.Feature[] = [];

    for (const mirror of mirrors) {
      const position = markerPosition(mirror, self);
      if (!position) continue;

      currentSubdomains.add(mirror.subdomain);
      const status = mirrorStatus(mirror);
      const existing = this.markers.get(mirror.subdomain);

      if (existing) {
        existing.setLngLat(position);
        const element = existing.getElement();
        element.classList.toggle('marker-active', status === 'active');
        const svgPath = element.querySelector('svg path');
        if (svgPath) svgPath.setAttribute('fill', MARKER_COLORS[status]);
      } else {
        this.addMarker(mirror, position, status);
      }

      if (mirror.latlon && mirror.healthy) {
        circleFeatures.push(turf.circle(position, CIRCLE_RADIUS_KM, { steps: CIRCLE_STEPS, units: 'kilometers' }));
      }
    }

    this.updateCircleFeatures(circleFeatures);
    this.removeStaleMarkers(currentSubdomains);
    this.focusInitialPosition(mirrors, self);
  }

  private addMarker(mirror: Mirror, position: [number, number], status: MirrorStatus): void {
    if (!this.map) return;

    const marker = new Marker({ color: MARKER_COLORS[status] })
      .setLngLat(position)
      .setPopup(
        new Popup({ offset: 25, closeButton: false, focusAfterOpen: false }).setHTML(mirrorPopupHtml(mirror, status)),
      )
      .addTo(this.map);

    marker.getElement().classList.toggle('marker-active', status === 'active');
    this.markers.set(mirror.subdomain, marker);
  }

  private updateCircleFeatures(features: GeoJSON.Feature[]): void {
    const source = this.map?.getSource(CIRCLE_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features });
  }

  private removeStaleMarkers(currentSubdomains: Set<string>): void {
    this.markers.forEach((marker, subdomain) => {
      if (!currentSubdomains.has(subdomain)) {
        marker.remove();
        this.markers.delete(subdomain);
      }
    });
  }

  private focusInitialPosition(mirrors: Mirror[], self: MirrorSelf | undefined): void {
    if (!this.map) return;

    const focus = this.focus();
    let target: [number, number] | null = null;

    if (isValidPosition(focus)) {
      target = focus;
    } else if (!this.lastFocus) {
      const activeMirror = mirrors.find((mirror) => mirror.geo_active);
      if (activeMirror?.latlon) {
        target = [activeMirror.latlon[1], activeMirror.latlon[0]];
      } else if (self?.latlon) {
        target = [self.latlon[1], self.latlon[0]];
      }
    }

    if (target && (!this.lastFocus || !samePosition(target, this.lastFocus))) {
      this.map.flyTo({ center: target, zoom: FOCUS_ZOOM, speed: FOCUS_SPEED, essential: true });
      this.lastFocus = target;
    }
  }
}
