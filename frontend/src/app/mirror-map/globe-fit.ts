/**
 * Zoom that fits the whole MapLibre globe inside a canvas of the given size.
 *
 * MapLibre draws the globe with a fixed vertical field of view and a camera
 * `1.5 * height` pixels from the map centre. The visible silhouette is a circle of radius
 * `camera * tan(horizon)` with `sin(horizon) = radius / (camera + radius)`, and the globe
 * radius in pixels is `worldSize / (2 * PI) / cos(latitude)`. Solving that for the zoom keeps
 * the sphere inside the box at any centre latitude.
 *
 * Without this fit a fixed zoom draws a sphere many times taller than the box, so the horizon
 * lands inside the viewport and the map renders as a lens with black wedges at the corners.
 */

/** MapLibre's fixed vertical field of view. */
const FOV_RADIANS = 0.6435011087932844;

/** MapLibre clamps the planet scale at this latitude. */
const MAX_LATITUDE = 85.051129;

const GLOBE_FIT_RATIO = 0.9;
const TILE_SIZE = 512;

export function globeFitZoom(width: number, height: number, latitude: number): number {
  const shortEdge = Math.min(width, height);
  if (shortEdge <= 0) return 0;

  const silhouetteRadiusPx = (shortEdge / 2) * GLOBE_FIT_RATIO;
  const cameraDistancePx = height / 2 / Math.tan(FOV_RADIANS / 2);
  const sinHorizon = silhouetteRadiusPx / Math.hypot(cameraDistancePx, silhouetteRadiusPx);
  const globeRadiusPx = (sinHorizon * cameraDistancePx) / (1 - sinHorizon);
  const planetScale = Math.cos((Math.min(Math.abs(latitude), MAX_LATITUDE) * Math.PI) / 180);
  return Math.log2((globeRadiusPx * 2 * Math.PI * planetScale) / TILE_SIZE);
}
