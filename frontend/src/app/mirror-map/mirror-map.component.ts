import { Component, computed, effect, ElementRef, inject, input, OnDestroy, viewChild } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import type { Mirror, MirrorSelf } from '@chaotic-next/shared-lib';
import * as turf from '@turf/turf';
import type { GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import { Map as MaplibreMap, Marker, NavigationControl, Popup, setWorkerUrl } from 'maplibre-gl';
import { getCountryCoordinates } from './country-coordinates';
import { LiveTrafficService, type TrafficHit } from './live-traffic.service';

const { mocha } = flavors;
const WORKER_URL = '/maplibre-gl-worker.mjs';

function createCatppuccinStyle(projection: 'globe' | 'flat'): StyleSpecification {
  const isGlobe = projection === 'globe';

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
          'background-color': '#11111b', // Catppuccin Crust
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
          'fill-color': '#1e1e2e', // Catppuccin Base (solid elegant land)
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
          'line-color': '#89b4fa', // Catppuccin Blue subtle coastal accent
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
          'line-color': '#313244', // Catppuccin Surface0 crisp border
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
          'line-color': '#45475a',
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
const CIRCLE_COLOR = '#cba6f7';
const CIRCLE_RADIUS_KM = 2414.016;
const CIRCLE_STEPS = 128;
const FOCUS_ZOOM = 3;
const FOCUS_SPEED = 1.2;

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

const GARUDA_COLOR = '#89dceb';
const DEFAULT_PING_COLOR = '#cba6f7';
const FIREBALL_CORE_COLOR = '#f9e2af';
const FIREBALL_TRAIL_COLOR = '#fab387';
const IMPACT_FLASH_COLOR = '#ffffff';
const IMPACT_STROKE_COLOR = '#f38ba8';
const IMPACT_ACCENT_COLOR = '#eba0ac';

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
  const lastUpdate = new Date(mirror.last_update).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  return `
    <b>${mirror.subdomain}</b>
    <span style="opacity: 0.7">| ${STATUS_LABELS[status]}</span>
    ${mirror.official ? '<i class="pi pi-verified" style="color: #89b4fa" title="Official mirror"></i>' : ''}
    <br />
    <a href="https://${mirror.subdomain}.chaotic.cx" target="_blank" rel="noopener" tabindex="-1">${mirror.subdomain}.chaotic.cx</a>
    <br />
    <span style="opacity: 0.7">Last update: ${lastUpdate}</span>
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

interface ActivePing {
  id: string;
  targetLng: number;
  targetLat: number;
  startLng: number;
  startLat: number;
  color: string;
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
  host: {
    '[class.fill-height]': 'fillHeight()',
  },
  template: `
    <div class="mirror-map" #mapDiv></div>

    <!-- Map Overlays -->
    <div class="stats">
      <div class="stat-item">
        <span class="stat-dot" [style.background]="mocha.colors.mauve.hex"></span>
        <span class="stat-label">Active</span>
        <span class="stat-count">{{ counts().active }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-dot" [style.background]="mocha.colors.green.hex"></span>
        <span class="stat-label">Healthy</span>
        <span class="stat-count">{{ counts().healthy }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-dot" [style.background]="mocha.colors.red.hex"></span>
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
        height: 36rem;
        min-height: 20rem;
        border-radius: 12px;
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
  private readonly liveTraffic = inject(LiveTrafficService);
  private readonly ctp = mocha;

  readonly mirrors = input<Mirror[]>([]);
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

      this.mirrors();
      this.self();
      this.focus();
      this.showMirrors();
      if (this.map) {
        this.updateMap();
      }
    });

    effect(() => {
      const proj = this.projection();
      const custom = this.customStyleUrl();
      const targetStyle = custom || createCatppuccinStyle(proj);

      if (this.map) {
        this.map.setStyle(targetStyle);
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
    this.stopAnimationLoop();
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  private initMap(container: HTMLDivElement): void {
    setWorkerUrl(WORKER_URL);

    const proj = this.projection();
    const initialStyle = this.customStyleUrl() || createCatppuccinStyle(proj);

    this.map = new MaplibreMap({
      container,
      style: initialStyle,
      center: [0, 30],
      zoom: proj === 'globe' ? 0.95 : 1.2,
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
      this.startAnimationLoop();
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
    if (!this.map || this.map.getSource(CIRCLE_SOURCE_ID)) return;

    const emptyData: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    this.map.addSource(CIRCLE_SOURCE_ID, { type: 'geojson', data: emptyData });
    this.map.addLayer({
      id: CIRCLE_FILL_LAYER_ID,
      type: 'fill',
      source: CIRCLE_SOURCE_ID,
      paint: { 'fill-color': CIRCLE_COLOR, 'fill-opacity': 0.015 },
    });
    this.map.addLayer({
      id: CIRCLE_OUTLINE_LAYER_ID,
      type: 'line',
      source: CIRCLE_SOURCE_ID,
      paint: { 'line-color': CIRCLE_COLOR, 'line-width': 0.5, 'line-opacity': 0.18 },
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
    if (!this.map) return;
    this.addTrafficLayers();

    const coords = getCountryCoordinates(hit.countryCode);
    if (!coords) return;

    const isGaruda = hit.repo.toLowerCase().includes('garuda');
    const color = isGaruda ? GARUDA_COLOR : DEFAULT_PING_COLOR;

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
      color,
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
  }

  private startAnimationLoop(): void {
    const animate = () => {
      this.tickAnimations();
      this.animationFrameId = requestAnimationFrame(animate);
    };
    this.animationFrameId = requestAnimationFrame(animate);
  }

  private stopAnimationLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private tickAnimations(): void {
    if (!this.map || !this.map.isStyleLoaded()) return;

    const showHits = this.showHits();
    if (!showHits) {
      if (this.activePings.length > 0) this.activePings = [];
      if (this.activeArcs.length > 0) this.activeArcs = [];
      const meteorSource = this.map.getSource(TRAFFIC_METEORS_SOURCE_ID) as GeoJSONSource | undefined;
      meteorSource?.setData({ type: 'FeatureCollection', features: [] });
      const pingSource = this.map.getSource(TRAFFIC_PINGS_SOURCE_ID) as GeoJSONSource | undefined;
      pingSource?.setData({ type: 'FeatureCollection', features: [] });
      const arcSource = this.map.getSource(TRAFFIC_ARCS_SOURCE_ID) as GeoJSONSource | undefined;
      arcSource?.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const now = performance.now();
    const meteorFeatures: GeoJSON.Feature[] = [];
    const pingFeatures: GeoJSON.Feature[] = [];

    this.activePings = this.activePings.filter((ping) => {
      const elapsed = now - ping.createdAt;
      if (elapsed > TOTAL_PING_DURATION_MS) return false;

      if (elapsed < METEOR_DURATION_MS) {
        // Phase 1: Meteor entry streak descending into the country
        const t = elapsed / METEOR_DURATION_MS;
        const eased = t * t; // accelerate downward under gravity

        const headLng = ping.startLng + (ping.targetLng - ping.startLng) * eased;
        const headLat = ping.startLat + (ping.targetLat - ping.startLat) * eased;

        const tailT = Math.max(0, eased - 0.35);
        const tailLng = ping.startLng + (ping.targetLng - ping.startLng) * tailT;
        const tailLat = ping.startLat + (ping.targetLat - ping.startLat) * tailT;

        const isGaruda = ping.color === GARUDA_COLOR;
        const streakColor = isGaruda ? GARUDA_COLOR : FIREBALL_TRAIL_COLOR;

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
            color: isGaruda ? GARUDA_COLOR : FIREBALL_CORE_COLOR,
            opacity: 0.95,
            strokeWidth: 2,
            strokeColor: FIREBALL_TRAIL_COLOR,
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
              color: IMPACT_FLASH_COLOR,
              opacity: flashFactor * 0.95,
              strokeWidth: 3 * flashFactor,
              strokeColor: FIREBALL_CORE_COLOR,
              strokeOpacity: flashFactor * 0.9,
            },
          });
        }

        // Primary shockwave
        const shockRadius = 6 + Math.sqrt(factor) * SHOCKWAVE_MAX_RADIUS;
        const strokeColor = ping.color === GARUDA_COLOR ? GARUDA_COLOR : IMPACT_STROKE_COLOR;

        pingFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [ping.targetLng, ping.targetLat],
          },
          properties: {
            radius: shockRadius,
            color: ping.color,
            opacity: invFactor * 0.25,
            strokeWidth: 2.5,
            strokeColor,
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
            color: FIREBALL_TRAIL_COLOR,
            opacity: 0,
            strokeWidth: 1.5,
            strokeColor: FIREBALL_TRAIL_COLOR,
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
            color: ping.color === GARUDA_COLOR ? GARUDA_COLOR : IMPACT_STROKE_COLOR,
            opacity: invFactor * 0.95,
            strokeWidth: 1.5,
            strokeColor: IMPACT_ACCENT_COLOR,
            strokeOpacity: invFactor * 0.95,
          },
        });
      }

      return true;
    });

    const meteorSource = this.map.getSource(TRAFFIC_METEORS_SOURCE_ID) as GeoJSONSource | undefined;
    meteorSource?.setData({ type: 'FeatureCollection', features: meteorFeatures });

    const pingSource = this.map.getSource(TRAFFIC_PINGS_SOURCE_ID) as GeoJSONSource | undefined;
    pingSource?.setData({ type: 'FeatureCollection', features: pingFeatures });

    const arcFeatures: GeoJSON.Feature[] = [];
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

    const arcSource = this.map.getSource(TRAFFIC_ARCS_SOURCE_ID) as GeoJSONSource | undefined;
    arcSource?.setData({ type: 'FeatureCollection', features: arcFeatures });
  }

  private updateMap(): void {
    if (!this.map) return;

    const showMirrors = this.showMirrors();
    const mirrors = this.mirrors();
    const self = this.self();
    const currentSubdomains = new Set<string>();
    const circleFeatures: GeoJSON.Feature[] = [];

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
          if (svgPath) svgPath.setAttribute('fill', MARKER_COLORS[status]);
        } else {
          this.addMarker(mirror, position, status);
        }

        if (mirror.latlon && mirror.healthy) {
          circleFeatures.push(turf.circle(position, CIRCLE_RADIUS_KM, { steps: CIRCLE_STEPS, units: 'kilometers' }));
        }
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

  protected readonly mocha = mocha;
}
