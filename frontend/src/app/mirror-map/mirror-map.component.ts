import { Component, computed, effect, ElementRef, inject, input, OnDestroy, viewChild } from '@angular/core';
import type { AccentName, CatppuccinColors } from '@catppuccin/palette';
import type { Mirror, MirrorSelf } from '@chaotic-next/shared-lib';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import type { GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import { Map as MaplibreMap, Marker, NavigationControl, Popup, setWorkerUrl } from 'maplibre-gl';
import { prefersReducedMotion } from '../functions';
import { injectActiveTranslation } from '../i18n/active-translation';
import { injectLazyStylesheet } from '../lazy-stylesheet';
import { MISSING_VALUE } from '../table-columns/missing-value';
import { flavour, paletteColor, themePalette } from '../theme';
import { UnknownValueComponent } from '../ui-states/unknown-value.component';
import { getCountryCoordinates } from './country-coordinates';
import { LiveTrafficService, type TrafficHit } from './live-traffic.service';

const WORKER_URL = '/maplibre-gl-worker.mjs';

const GRADE_SATURATION = 1.2;
const GRADE_CONTRAST = 1.1;
const LUMA_RED = 0.213;
const LUMA_GREEN = 0.715;
const LUMA_BLUE = 0.072;
const CONTRAST_MIDPOINT = 0.5;
const CHANNEL_MAX = 255;

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function contrasted(channel: number): number {
  return (channel - CONTRAST_MIDPOINT) * GRADE_CONTRAST + CONTRAST_MIDPOINT;
}

function hexChannel(channel: number): string {
  return Math.round(clampUnit(channel) * CHANNEL_MAX)
    .toString(16)
    .padStart(2, '0');
}

/**
 * Applies the CSS `saturate()` and `contrast()` filter math to one colour.
 * The map style uses these graded colours, so the canvas needs no CSS filter.
 */
function gradedColor(hex: string): string {
  const red = parseInt(hex.slice(1, 3), 16) / CHANNEL_MAX;
  const green = parseInt(hex.slice(3, 5), 16) / CHANNEL_MAX;
  const blue = parseInt(hex.slice(5, 7), 16) / CHANNEL_MAX;
  const crossWeight = 1 - GRADE_SATURATION;

  const saturatedRed =
    (LUMA_RED + (1 - LUMA_RED) * GRADE_SATURATION) * red +
    LUMA_GREEN * crossWeight * green +
    LUMA_BLUE * crossWeight * blue;
  const saturatedGreen =
    LUMA_RED * crossWeight * red +
    (LUMA_GREEN + (1 - LUMA_GREEN) * GRADE_SATURATION) * green +
    LUMA_BLUE * crossWeight * blue;
  const saturatedBlue =
    LUMA_RED * crossWeight * red +
    LUMA_GREEN * crossWeight * green +
    (LUMA_BLUE + (1 - LUMA_BLUE) * GRADE_SATURATION) * blue;

  const channels = [contrasted(saturatedRed), contrasted(saturatedGreen), contrasted(saturatedBlue)];

  return `#${channels.map(hexChannel).join('')}`;
}

interface MapColors {
  background: string;
  land: string;
  coastline: string;
  boundary: string;
  geolines: string;
}

/**
 * The sea is crust and the land is base in both flavours.
 * In Latte that gives a slightly darker sea under light land, in Mocha a near-black sea under dark land.
 */
function mapColors(palette: CatppuccinColors): MapColors {
  return {
    background: gradedColor(palette.crust.hex),
    land: gradedColor(palette.base.hex),
    coastline: gradedColor(palette.blue.hex),
    boundary: gradedColor(palette.surface0.hex),
    geolines: gradedColor(palette.surface1.hex),
  };
}

function createCatppuccinStyle(projection: 'globe' | 'flat', palette: CatppuccinColors): StyleSpecification {
  const isGlobe = projection === 'globe';
  const colors = mapColors(palette);

  return {
    version: 8,
    name: `Catppuccin ${isGlobe ? 'Globe' : 'Flat'}`,
    ...(isGlobe ? { projection: { type: 'globe' } } : {}),
    sources: {
      maplibre: {
        type: 'vector',
        url: 'https://demotiles.maplibre.org/tiles/tiles.json',
      },
    },
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': colors.background,
        },
        layout: {
          visibility: 'visible',
        },
        maxzoom: 24,
      },
      {
        'id': 'countries-fill',
        'type': 'fill',
        'source': 'maplibre',
        'source-layer': 'countries',
        'paint': {
          'fill-color': colors.land,
          'fill-opacity': 0.95,
        },
        'layout': {
          visibility: 'visible',
        },
        'minzoom': 0,
        'maxzoom': 24,
      },
      {
        'id': 'coastline',
        'type': 'line',
        'source': 'maplibre',
        'source-layer': 'countries',
        'paint': {
          'line-color': colors.coastline,
          'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.8, 6, 1.5, 14, 2.5],
          'line-opacity': 0.45,
        },
        'layout': {
          'line-cap': 'round',
          'line-join': 'round',
          'visibility': 'visible',
        },
        'minzoom': 0,
        'maxzoom': 24,
      },
      {
        'id': 'countries-boundary',
        'type': 'line',
        'source': 'maplibre',
        'source-layer': 'countries',
        'paint': {
          'line-color': colors.boundary,
          'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 6, 1, 14, 1.5],
          'line-opacity': 0.8,
        },
        'layout': {
          'line-cap': 'round',
          'line-join': 'round',
          'visibility': 'visible',
        },
        'minzoom': 0,
        'maxzoom': 24,
      },
      {
        'id': 'geolines',
        'type': 'line',
        'source': 'maplibre',
        'source-layer': 'geolines',
        'paint': {
          'line-color': colors.geolines,
          'line-width': 0.5,
          'line-dasharray': [2, 3],
          'line-opacity': 0.2,
        },
        'layout': {
          visibility: 'visible',
        },
        'minzoom': 0,
        'maxzoom': 24,
      },
    ],
  };
}

const CIRCLE_SOURCE_ID = 'circles';
const CIRCLE_FILL_LAYER_ID = 'circles-layer';
const CIRCLE_OUTLINE_LAYER_ID = 'circles-outline';
const CIRCLE_RADIUS_KM = 2414.016;
const CIRCLE_STEPS = 128;
const FOCUS_ZOOM = 3;
const FOCUS_SPEED = 1.2;
const POPUP_OFFSET_PX = 25;

const TRAFFIC_METEORS_SOURCE_ID = 'traffic-meteors-source';
const TRAFFIC_METEORS_LAYER_ID = 'traffic-meteors-layer';
const TRAFFIC_PINGS_SOURCE_ID = 'traffic-pings-source';
const TRAFFIC_PINGS_LAYER_ID = 'traffic-pings-layer';
const TRAFFIC_ARCS_SOURCE_ID = 'traffic-arcs-source';
const TRAFFIC_ARCS_LAYER_ID = 'traffic-arcs-layer';

const METEOR_DURATION_MS = 380;
const IMPACT_DURATION_MS = 1420;
const TOTAL_PING_DURATION_MS = METEOR_DURATION_MS + IMPACT_DURATION_MS;
const ARC_DURATION_MS = 1200;
const MAX_ACTIVE_PINGS = 50;
const MAX_ACTIVE_ARCS = 30;

const METEOR_HEAD_RADIUS_BASE = 4;
const METEOR_HEAD_RADIUS_SCALE = 2;
const IMPACT_FLASH_DURATION_MS = 100;
const IMPACT_FLASH_RADIUS_BASE = 8;
const IMPACT_FLASH_RADIUS_SCALE = 10;
const SHOCKWAVE_MAX_RADIUS = 55;
const CRATER_WAVE_MAX_RADIUS = 75;
const ARC_STEP_COUNT = 15;
const ARC_HEIGHT_OFFSET = 12;

interface TrafficColors {
  garuda: string;
  ping: string;
  fireballCore: string;
  fireballTrail: string;
  impactFlash: string;
  impactStroke: string;
  impactAccent: string;
}

function trafficColors(palette: CatppuccinColors): TrafficColors {
  return {
    garuda: gradedColor(palette.sky.hex),
    ping: gradedColor(palette.mauve.hex),
    fireballCore: gradedColor(palette.yellow.hex),
    fireballTrail: gradedColor(palette.peach.hex),
    impactFlash: gradedColor(palette.rosewater.hex),
    impactStroke: gradedColor(palette.red.hex),
    impactAccent: gradedColor(palette.maroon.hex),
  };
}

type MirrorStatus = 'active' | 'healthy' | 'down';

const MARKER_COLOR_NAMES: Record<MirrorStatus, AccentName> = {
  active: 'mauve',
  healthy: 'green',
  down: 'red',
};

function markerColor(status: MirrorStatus): string {
  return paletteColor(MARKER_COLOR_NAMES[status]);
}

function mirrorStatus(mirror: Mirror): MirrorStatus {
  return mirror.geo_active ? 'active' : mirror.healthy ? 'healthy' : 'down';
}

const STATUS_LABEL_KEYS: Record<MirrorStatus, string> = {
  active: marker('mirrorMap.status.active'),
  healthy: marker('mirrorMap.status.healthy'),
  down: marker('mirrorMap.status.down'),
};

interface MirrorPopupLabels {
  status: string;
  official: string;
  lastUpdate: string;
}

function mirrorPopupHtml(mirror: Mirror, labels: MirrorPopupLabels): string {
  const officialIcon = `<i class="pi pi-verified" style="color: var(--catppuccin-color-blue)" role="img" aria-label="${labels.official}" title="${labels.official}"></i>`;

  return `
    <b>${mirror.subdomain}</b>
    <span style="opacity: 0.7">| ${labels.status}</span>
    ${mirror.official ? officialIcon : ''}
    <br />
    <a href="https://${mirror.subdomain}.chaotic.cx" target="_blank" rel="noopener">${mirror.subdomain}.chaotic.cx</a>
    <br />
    <span style="opacity: 0.7">${labels.lastUpdate}</span>
  `;
}

function circleCoveragePolygon(position: [number, number], radiusKm: number, steps: number): Feature<Polygon> {
  const lng1 = (position[0] * Math.PI) / 180;
  const lat1 = (position[1] * Math.PI) / 180;
  const angular = radiusKm / (6371008.8 / 1000);
  const ring: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const bearingRad = ((i * -360) / steps) * (Math.PI / 180);
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearingRad),
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(bearingRad) * Math.sin(angular) * Math.cos(lat1),
        Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
      );
    ring.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  ring.push([...ring[0]]);
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
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

interface ActivePing {
  id: string;
  targetLng: number;
  targetLat: number;
  startLng: number;
  startLat: number;
  isGaruda: boolean;
  createdAt: number;
}

interface ActiveArc {
  id: string;
  source: [number, number];
  target: [number, number];
  color: string;
  createdAt: number;
}

@Component({
  selector: 'chaotic-mirror-map',
  imports: [TranslocoDirective, UnknownValueComponent],
  host: {
    '[class.fill-height]': 'fillHeight()',
  },
  template: `
    <div class="mirror-map" #mapDiv></div>

    <!-- Map Overlays -->
    <div class="stats" *transloco="let t; prefix: 'mirrorMap.status'">
      <div class="stat-item">
        <span class="stat-dot stat-dot--active"></span>
        <span class="stat-label">{{ t('active') }}</span>
        <span class="stat-count">
          @if (countsKnown()) {
            {{ counts().active }}
          } @else {
            <chaotic-unknown-value />
          }
        </span>
      </div>
      <div class="stat-item">
        <span class="stat-dot stat-dot--healthy"></span>
        <span class="stat-label">{{ t('healthy') }}</span>
        <span class="stat-count">
          @if (countsKnown()) {
            {{ counts().healthy }}
          } @else {
            <chaotic-unknown-value />
          }
        </span>
      </div>
      <div class="stat-item">
        <span class="stat-dot stat-dot--down"></span>
        <span class="stat-label">{{ t('down') }}</span>
        <span class="stat-count">
          @if (countsKnown()) {
            {{ counts().down }}
          } @else {
            <chaotic-unknown-value />
          }
        </span>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        position: relative;
        display: block;
        width: 100%;
        height: 36rem;
        min-height: 20rem;
        border-radius: var(--chaotic-radius-lg);
        overflow: hidden;
      }

      :host.fill-height {
        height: 100%;
        min-height: 22rem;
        flex: 1 1 0%;
      }

      @media (max-width: 640px) {
        :host {
          height: 22rem;
          min-height: 18rem;
        }

        :host.fill-height {
          min-height: 18rem;
        }

        .stats {
          padding: 8px 10px;
          font-size: var(--chaotic-text-xs);
        }
      }

      .mirror-map {
        position: absolute;
        inset: 0;
        background-color: transparent;
        backdrop-filter: blur(var(--chaotic-blur));
        -webkit-backdrop-filter: blur(var(--chaotic-blur));
      }

      :host ::ng-deep .maplibregl-ctrl-group {
        background: color-mix(in srgb, var(--catppuccin-color-mantle) 85%, transparent) !important;
        backdrop-filter: blur(var(--chaotic-blur)) !important;
        -webkit-backdrop-filter: blur(var(--chaotic-blur)) !important;
        border: 1px solid var(--catppuccin-color-surface0) !important;
        border-radius: var(--chaotic-radius-md) !important;
        box-shadow: var(--chaotic-shadow-overlay) !important;
        color: var(--chaotic-fg) !important;
        overflow: hidden;
      }

      :host ::ng-deep .maplibregl-ctrl-group .maplibregl-ctrl-icon {
        filter: invert(var(--chaotic-icon-invert));
      }

      :host ::ng-deep .maplibregl-ctrl-attrib {
        display: none !important;
      }

      :host ::ng-deep .maplibregl-popup {
        z-index: var(--chaotic-z-popover) !important;
      }

      :host ::ng-deep .maplibregl-popup-content {
        background-color: var(--catppuccin-color-mantle) !important;
        color: var(--chaotic-fg) !important;
        border-radius: var(--chaotic-radius-md) !important;
        padding: 10px 14px !important;
        border: 1px solid var(--catppuccin-color-surface0) !important;
        box-shadow: var(--chaotic-shadow-overlay) !important;
        font-weight: var(--chaotic-weight-medium);
        font-size: var(--chaotic-text-xs);
        line-height: 1.6;
      }

      :host ::ng-deep .maplibregl-popup-content a {
        color: var(--catppuccin-color-mauve);
        text-decoration: none;
        font-weight: var(--chaotic-weight-semibold);
      }

      :host ::ng-deep .maplibregl-ctrl-group button + button {
        border-top: 1px solid var(--catppuccin-color-surface0) !important;
      }

      :host ::ng-deep .maplibregl-popup-tip {
        border-top-color: var(--catppuccin-color-mantle) !important;
        border-bottom-color: var(--catppuccin-color-mantle) !important;
      }

      :host ::ng-deep .maplibregl-container {
        font-family: Inter, InterVariable, sans-serif !important;
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

      @media (prefers-reduced-motion: reduce) {
        :host ::ng-deep .marker-active svg {
          animation: none;
        }
      }

      .stats {
        position: absolute;
        bottom: 25px;
        left: 25px;
        background: color-mix(in srgb, var(--catppuccin-color-mantle) 85%, transparent);
        backdrop-filter: blur(var(--chaotic-blur));
        -webkit-backdrop-filter: blur(var(--chaotic-blur));
        border: 1px solid var(--catppuccin-color-surface0);
        border-radius: var(--chaotic-radius-md);
        padding: 12px 16px;
        color: var(--chaotic-fg);
        font-size: var(--chaotic-text-sm);
        pointer-events: none;
        z-index: var(--chaotic-z-overlay);
        box-shadow: var(--chaotic-shadow-overlay);
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

      .stat-dot--active {
        background: var(--catppuccin-color-mauve);
      }

      .stat-dot--healthy {
        background: var(--catppuccin-color-green);
      }

      .stat-dot--down {
        background: var(--catppuccin-color-red);
      }

      .stat-label {
        font-weight: var(--chaotic-weight-medium);
        opacity: 0.8;
      }

      .stat-count {
        font-weight: var(--chaotic-weight-bold);
        margin-left: auto;
      }
    `,
  ],
})
export class MirrorMapComponent implements OnDestroy {
  private readonly liveTraffic = inject(LiveTrafficService);
  private readonly transloco = inject(TranslocoService);
  private readonly activeTranslation = injectActiveTranslation();

  readonly mirrors = input<Mirror[]>([]);
  // False while the mirror list loads or after it failed, so the overlay shows no false zeros.
  readonly countsKnown = input(true);
  readonly self = input<MirrorSelf | undefined>(undefined);
  readonly focus = input<[number, number] | null>(null);
  readonly fillHeight = input(false);
  readonly livePingsEnabled = input(false);
  readonly showHits = input(true);
  readonly showMirrors = input(true);
  readonly projection = input<'globe' | 'flat'>('globe');
  readonly customStyleUrl = input<string | null>(null);

  private readonly mapDiv = viewChild<ElementRef<HTMLDivElement>>('mapDiv');

  private map?: MaplibreMap;
  private readonly markers = new Map<string, Marker>();
  private resizeObserver?: ResizeObserver;
  private lastFocus: [number, number] | null = null;

  private activePings: ActivePing[] = [];
  private activeArcs: ActiveArc[] = [];
  private animationFrameId: number | null = null;
  private currentAppliedStyle: string | null = null;

  private readonly traffic = computed(() => trafficColors(themePalette()));

  readonly counts = computed(() => {
    const counts = { active: 0, healthy: 0, down: 0 };
    for (const mirror of this.mirrors()) {
      counts[mirrorStatus(mirror)]++;
    }
    return counts;
  });

  constructor() {
    injectLazyStylesheet('maplibre');
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    effect(() => {
      const div = this.mapDiv();
      if (div && !this.map) {
        this.initMap(div.nativeElement);
      }

      this.mirrors();
      this.self();
      this.focus();
      this.showMirrors();
      this.activeTranslation();
      flavour();
      if (this.map) {
        this.updateMap();
      }
    });

    effect(() => {
      const proj = this.projection();
      const custom = this.customStyleUrl();
      const targetStyle = custom || createCatppuccinStyle(proj, themePalette());

      if (this.map) {
        this.map.setStyle(targetStyle);
      }
    });

    effect(() => {
      if (!this.showHits()) {
        this.clearTraffic();
      }
    });

    effect(() => {
      const hit = this.liveTraffic.latestHit();
      const enabled = this.livePingsEnabled() && this.showHits();
      if (enabled && hit && this.map && (this.map.isStyleLoaded() || this.map.loaded())) {
        this.triggerTrafficPing(hit);
      }
    });
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.stopAnimationLoop();
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  private initMap(container: HTMLDivElement): void {
    setWorkerUrl(WORKER_URL);

    const proj = this.projection();
    const initialStyle = this.customStyleUrl() || createCatppuccinStyle(proj, themePalette());

    this.map = new MaplibreMap({
      container,
      style: initialStyle,
      center: [0, 30],
      zoom: proj === 'globe' ? 0.95 : 1.2,
      locale: this.controlLocale(),
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
    const onReady = () => {
      this.addCircleLayers();
      this.addTrafficLayers();
      this.updateMap();
    };

    if (this.map.isStyleLoaded()) {
      onReady();
    } else {
      this.map.once('load', onReady);
    }

    this.map.on('styledata', () => {
      this.addCircleLayers();
      this.addTrafficLayers();
      this.updateMap();
    });
  }

  private addCircleLayers(): void {
    if (!this.map) return;

    const circleColor = gradedColor(themePalette().mauve.hex);
    if (this.map.getSource(CIRCLE_SOURCE_ID)) {
      this.map.setPaintProperty(CIRCLE_FILL_LAYER_ID, 'fill-color', circleColor);
      this.map.setPaintProperty(CIRCLE_OUTLINE_LAYER_ID, 'line-color', circleColor);
      return;
    }

    const emptyData: FeatureCollection = { type: 'FeatureCollection', features: [] };
    this.map.addSource(CIRCLE_SOURCE_ID, { type: 'geojson', data: emptyData });
    this.map.addLayer({
      id: CIRCLE_FILL_LAYER_ID,
      type: 'fill',
      source: CIRCLE_SOURCE_ID,
      paint: { 'fill-color': circleColor, 'fill-opacity': 0.015 },
    });
    this.map.addLayer({
      id: CIRCLE_OUTLINE_LAYER_ID,
      type: 'line',
      source: CIRCLE_SOURCE_ID,
      paint: { 'line-color': circleColor, 'line-width': 0.5, 'line-opacity': 0.18 },
    });
  }

  private addTrafficLayers(): void {
    if (!this.map) return;

    if (!this.map.getSource(TRAFFIC_ARCS_SOURCE_ID)) {
      this.map.addSource(TRAFFIC_ARCS_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      this.map.addLayer({
        id: TRAFFIC_ARCS_LAYER_ID,
        type: 'line',
        source: TRAFFIC_ARCS_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 3,
          'line-opacity': ['get', 'opacity'],
        },
      });
    }

    if (!this.map.getSource(TRAFFIC_METEORS_SOURCE_ID)) {
      this.map.addSource(TRAFFIC_METEORS_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      this.map.addLayer({
        id: TRAFFIC_METEORS_LAYER_ID,
        type: 'line',
        source: TRAFFIC_METEORS_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': ['get', 'opacity'],
        },
      });
    }

    if (!this.map.getSource(TRAFFIC_PINGS_SOURCE_ID)) {
      this.map.addSource(TRAFFIC_PINGS_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      this.map.addLayer({
        id: TRAFFIC_PINGS_LAYER_ID,
        type: 'circle',
        source: TRAFFIC_PINGS_SOURCE_ID,
        paint: {
          'circle-radius': ['get', 'radius'],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['get', 'opacity'],
          'circle-stroke-width': ['get', 'strokeWidth'],
          'circle-stroke-color': ['get', 'strokeColor'],
          'circle-stroke-opacity': ['get', 'strokeOpacity'],
        },
      });
    }
  }

  private triggerTrafficPing(hit: TrafficHit): void {
    if (!this.map || prefersReducedMotion()) return;
    this.addTrafficLayers();

    const coords = getCountryCoordinates(hit.countryCode);
    if (!coords) return;

    const isGaruda = hit.repo.toLowerCase().includes('garuda');
    const colors = this.traffic();
    let color = colors.ping;
    if (isGaruda) {
      color = colors.garuda;
    }

    const targetLng = coords[0] + (Math.random() - 0.5) * 1.5;
    const targetLat = coords[1] + (Math.random() - 0.5) * 1.5;
    const deltaLng = 6.0 + Math.random() * 4.0;
    const deltaLat = 8.0 + Math.random() * 5.0;
    const startLng = targetLng - deltaLng;
    const startLat = Math.min(84, targetLat + deltaLat);
    const now = performance.now();

    this.activePings.push({
      id: hit.id,
      targetLng,
      targetLat,
      startLng,
      startLat,
      isGaruda,
      createdAt: now,
    });

    const targetMirror = this.mirrors().find(
      (m) =>
        hit.hostname.includes(m.subdomain) ||
        (hit.hostname.includes('geo-mirror') && m.geo_active) ||
        (m.official && m.healthy),
    );

    const targetPos = targetMirror ? markerPosition(targetMirror, this.self()) : null;
    if (targetPos) {
      this.activeArcs.push({
        id: hit.id,
        source: [targetLng, targetLat],
        target: targetPos,
        color,
        createdAt: now + METEOR_DURATION_MS,
      });
    }

    if (this.activePings.length > MAX_ACTIVE_PINGS) {
      this.activePings.splice(0, this.activePings.length - MAX_ACTIVE_PINGS);
    }
    if (this.activeArcs.length > MAX_ACTIVE_ARCS) {
      this.activeArcs.splice(0, this.activeArcs.length - MAX_ACTIVE_ARCS);
    }

    this.startAnimationLoop();
  }

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.stopAnimationLoop();
      return;
    }

    this.startAnimationLoop();
  };

  private hasActiveTraffic(): boolean {
    return this.activePings.length > 0 || this.activeArcs.length > 0;
  }

  /**
   * Runs frames only while pings or arcs are on screen and the tab is visible.
   * The last frame writes empty sources, so the map stays clean when the loop stops.
   */
  private startAnimationLoop(): void {
    if (this.animationFrameId !== null || document.hidden || !this.hasActiveTraffic()) return;

    this.animationFrameId = requestAnimationFrame(this.animate);
  }

  private readonly animate = (): void => {
    this.tickAnimations();
    if (!this.hasActiveTraffic()) {
      this.animationFrameId = null;
      return;
    }

    this.animationFrameId = requestAnimationFrame(this.animate);
  };

  private stopAnimationLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private clearTraffic(): void {
    this.stopAnimationLoop();
    this.activePings = [];
    this.activeArcs = [];
    this.setTrafficSource(TRAFFIC_METEORS_SOURCE_ID, []);
    this.setTrafficSource(TRAFFIC_PINGS_SOURCE_ID, []);
    this.setTrafficSource(TRAFFIC_ARCS_SOURCE_ID, []);
  }

  private setTrafficSource(sourceId: string, features: Feature[]): void {
    const source = this.map?.getSource(sourceId) as GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features });
  }

  private tickAnimations(): void {
    if (!this.map || !this.map.isStyleLoaded()) return;

    const now = performance.now();
    const colors = this.traffic();
    const meteorFeatures: Feature[] = [];
    const pingFeatures: Feature[] = [];

    this.activePings = this.activePings.filter((ping) => {
      const elapsed = now - ping.createdAt;
      if (elapsed > TOTAL_PING_DURATION_MS) return false;

      let pingColor = colors.ping;
      let strikeColor = colors.impactStroke;
      if (ping.isGaruda) {
        pingColor = colors.garuda;
        strikeColor = colors.garuda;
      }

      if (elapsed < METEOR_DURATION_MS) {
        // Phase 1: Meteor entry streak descending into the country
        const t = elapsed / METEOR_DURATION_MS;
        const eased = t * t; // accelerate downward under gravity

        const headLng = ping.startLng + (ping.targetLng - ping.startLng) * eased;
        const headLat = ping.startLat + (ping.targetLat - ping.startLat) * eased;

        const tailT = Math.max(0, eased - 0.35);
        const tailLng = ping.startLng + (ping.targetLng - ping.startLng) * tailT;
        const tailLat = ping.startLat + (ping.targetLat - ping.startLat) * tailT;

        let streakColor = colors.fireballTrail;
        let headColor = colors.fireballCore;
        if (ping.isGaruda) {
          streakColor = colors.garuda;
          headColor = colors.garuda;
        }

        meteorFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [tailLng, tailLat],
              [headLng, headLat],
            ],
          },
          properties: {
            color: streakColor,
            width: 2.5 + eased * 2.5,
            opacity: Math.min(1, t * 2.2),
          },
        });

        // Glowing incandescent meteor head
        pingFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [headLng, headLat],
          },
          properties: {
            radius: METEOR_HEAD_RADIUS_BASE + eased * METEOR_HEAD_RADIUS_SCALE,
            color: headColor,
            opacity: 0.95,
            strokeWidth: 2,
            strokeColor: colors.fireballTrail,
            strokeOpacity: 0.85,
          },
        });
      } else {
        // Phase 2: Meteor impact, flash & shockwaves
        const impactElapsed = elapsed - METEOR_DURATION_MS;
        const factor = impactElapsed / IMPACT_DURATION_MS;
        const invFactor = Math.max(0, 1 - factor);

        // Flash core during immediate impact
        if (impactElapsed < IMPACT_FLASH_DURATION_MS) {
          const flashFactor = 1 - impactElapsed / IMPACT_FLASH_DURATION_MS;
          pingFeatures.push({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [ping.targetLng, ping.targetLat],
            },
            properties: {
              radius: IMPACT_FLASH_RADIUS_BASE + flashFactor * IMPACT_FLASH_RADIUS_SCALE,
              color: colors.impactFlash,
              opacity: flashFactor * 0.95,
              strokeWidth: 3 * flashFactor,
              strokeColor: colors.fireballCore,
              strokeOpacity: flashFactor * 0.9,
            },
          });
        }

        // Primary shockwave
        const shockRadius = 6 + Math.sqrt(factor) * SHOCKWAVE_MAX_RADIUS;

        pingFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [ping.targetLng, ping.targetLat],
          },
          properties: {
            radius: shockRadius,
            color: pingColor,
            opacity: invFactor * 0.25,
            strokeWidth: 2.5,
            strokeColor: strikeColor,
            strokeOpacity: invFactor * 0.85,
          },
        });

        // Secondary crater wave
        const waveRadius = 4 + Math.pow(factor, 0.7) * CRATER_WAVE_MAX_RADIUS;
        pingFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [ping.targetLng, ping.targetLat],
          },
          properties: {
            radius: waveRadius,
            color: colors.fireballTrail,
            opacity: 0,
            strokeWidth: 1.5,
            strokeColor: colors.fireballTrail,
            strokeOpacity: invFactor * 0.45,
          },
        });

        // Residual impact ember
        pingFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [ping.targetLng, ping.targetLat],
          },
          properties: {
            radius: 4,
            color: strikeColor,
            opacity: invFactor * 0.95,
            strokeWidth: 1.5,
            strokeColor: colors.impactAccent,
            strokeOpacity: invFactor * 0.95,
          },
        });
      }

      return true;
    });

    this.setTrafficSource(TRAFFIC_METEORS_SOURCE_ID, meteorFeatures);
    this.setTrafficSource(TRAFFIC_PINGS_SOURCE_ID, pingFeatures);

    const arcFeatures: Feature[] = [];
    this.activeArcs = this.activeArcs.filter((arc) => {
      const elapsed = now - arc.createdAt;
      if (elapsed > ARC_DURATION_MS) return false;
      if (elapsed < 0) return true; // waiting for meteor strike before shooting arc

      const progress = elapsed / ARC_DURATION_MS;
      const opacity = Math.max(0, 1 - progress);

      const points: [number, number][] = [];
      const maxStep = Math.min(ARC_STEP_COUNT, Math.ceil(progress * ARC_STEP_COUNT) + 1);

      for (let s = 0; s <= maxStep; s++) {
        const t = s / ARC_STEP_COUNT;
        const lng = arc.source[0] + (arc.target[0] - arc.source[0]) * t;
        // parabolic curve height offset
        const latArcOffset = Math.sin(t * Math.PI) * ARC_HEIGHT_OFFSET;
        const lat = arc.source[1] + (arc.target[1] - arc.source[1]) * t + latArcOffset;
        points.push([lng, lat]);
      }

      if (points.length >= 2) {
        arcFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: points,
          },
          properties: {
            color: arc.color,
            opacity,
          },
        });
      }
      return true;
    });

    this.setTrafficSource(TRAFFIC_ARCS_SOURCE_ID, arcFeatures);
  }

  private updateMap(): void {
    if (!this.map) return;

    const showMirrors = this.showMirrors();
    const mirrors = this.mirrors();
    const self = this.self();
    const currentSubdomains = new Set<string>();
    const circleFeatures: Feature[] = [];

    if (showMirrors) {
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
          if (svgPath) svgPath.setAttribute('fill', markerColor(status));
          element.setAttribute('aria-label', this.markerLabel(mirror, status));
          existing.getPopup().setHTML(this.popupHtml(mirror, status));
        } else {
          this.addMarker(mirror, position, status);
        }

        if (mirror.latlon && mirror.healthy) {
          circleFeatures.push(circleCoveragePolygon(position, CIRCLE_RADIUS_KM, CIRCLE_STEPS));
        }
      }
    }

    this.updateCircleFeatures(circleFeatures);
    this.removeStaleMarkers(currentSubdomains);
    this.focusInitialPosition(mirrors, self);
  }

  private addMarker(mirror: Mirror, position: [number, number], status: MirrorStatus): void {
    if (!this.map) return;

    const mapMarker = new Marker({ color: markerColor(status) })
      .setLngLat(position)
      .setPopup(
        new Popup({ offset: POPUP_OFFSET_PX, closeButton: false, focusAfterOpen: false }).setHTML(
          this.popupHtml(mirror, status),
        ),
      )
      .addTo(this.map);

    const element = mapMarker.getElement();
    element.classList.toggle('marker-active', status === 'active');
    element.setAttribute('aria-label', this.markerLabel(mirror, status));
    this.markers.set(mirror.subdomain, mapMarker);
  }

  private markerLabel(mirror: Mirror, status: MirrorStatus): string {
    return this.transloco.translate('mirrorMap.markerLabel', {
      mirror: mirror.subdomain,
      status: this.transloco.translate(STATUS_LABEL_KEYS[status]),
    });
  }

  private popupHtml(mirror: Mirror, status: MirrorStatus): string {
    let lastUpdate = MISSING_VALUE;
    // Offline mirrors report no update time at all (0).
    if (mirror.last_update > 0) {
      lastUpdate = new Date(mirror.last_update).toLocaleString(navigator.language, {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    }

    return mirrorPopupHtml(mirror, {
      status: this.transloco.translate(STATUS_LABEL_KEYS[status]),
      official: this.transloco.translate('mirrorMap.popup.official'),
      lastUpdate: this.transloco.translate('mirrorMap.popup.lastUpdate', { date: lastUpdate }),
    });
  }

  /**
   * Labels for the built-in MapLibre controls.
   * MapLibre reads them once, when the map is created.
   */
  private controlLocale(): Record<string, string> {
    return {
      'NavigationControl.ZoomIn': this.transloco.translate('mirrorMap.controls.zoomIn'),
      'NavigationControl.ZoomOut': this.transloco.translate('mirrorMap.controls.zoomOut'),
      'NavigationControl.ResetBearing': this.transloco.translate('mirrorMap.controls.resetBearing'),
      'AttributionControl.ToggleAttribution': this.transloco.translate('mirrorMap.controls.toggleAttribution'),
      'AttributionControl.MapFeedback': this.transloco.translate('mirrorMap.controls.mapFeedback'),
    };
  }

  private updateCircleFeatures(features: Feature[]): void {
    const source = this.map?.getSource(CIRCLE_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features });
  }

  private removeStaleMarkers(currentSubdomains: Set<string>): void {
    this.markers.forEach((mapMarker, subdomain) => {
      if (!currentSubdomains.has(subdomain)) {
        mapMarker.remove();
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
      this.map.flyTo({ center: target, zoom: FOCUS_ZOOM, speed: FOCUS_SPEED });
      this.lastFocus = target;
    }
  }
}
