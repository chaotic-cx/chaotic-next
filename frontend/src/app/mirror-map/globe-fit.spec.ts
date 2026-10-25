import { describe, expect, it } from 'vitest';
import { globeFitZoom } from './globe-fit';

/**
 * Radius of the globe silhouette in pixels, measured the way MapLibre draws it.
 * Used to prove that the fit keeps the sphere inside the canvas.
 */
function silhouetteDiameter(width: number, height: number, latitude: number): number {
  const zoom = globeFitZoom(width, height, latitude);
  const worldSize = 512 * 2 ** zoom;
  const planetScale = Math.cos((Math.min(Math.abs(latitude), 85.051129) * Math.PI) / 180);
  const globeRadius = worldSize / (2 * Math.PI) / planetScale;
  const cameraDistance = height / 2 / Math.tan(0.6435011087932844 / 2);
  const sinHorizon = globeRadius / (cameraDistance + globeRadius);
  const tanHorizon = sinHorizon / Math.sqrt(1 - sinHorizon ** 2);

  return 2 * cameraDistance * tanHorizon;
}

describe('globeFitZoom', () => {
  it('fits the short edge of the map page box', () => {
    expect(globeFitZoom(1424, 352, 48.57)).toBeCloseTo(0.79, 1);
  });

  it('uses the extra height of the home map', () => {
    expect(globeFitZoom(1424, 576, 48.57)).toBeCloseTo(1.5, 1);
  });

  it('keeps the globe inside a tall phone canvas', () => {
    expect(globeFitZoom(374, 844, 48.57)).toBeCloseTo(0.64, 1);
  });

  it('draws the silhouette at 90% of the short edge', () => {
    for (const [width, height, latitude] of [
      [1424, 352, 48.57],
      [1424, 576, 48.57],
      [374, 844, 48.57],
      [1600, 422, 65],
      [800, 800, 0],
    ]) {
      expect(silhouetteDiameter(width, height, latitude)).toBeCloseTo(Math.min(width, height) * 0.9, 1);
    }
  });

  it('zooms out towards the poles, where the globe is drawn larger', () => {
    const equator = globeFitZoom(1424, 352, 0);
    const midLatitude = globeFitZoom(1424, 352, 48.57);
    const highLatitude = globeFitZoom(1424, 352, 75);

    expect(midLatitude).toBeLessThan(equator);
    expect(highLatitude).toBeLessThan(midLatitude);
  });

  it('zooms in as the canvas grows', () => {
    expect(globeFitZoom(800, 400, 48.57)).toBeLessThan(globeFitZoom(1600, 800, 48.57));
  });

  it('falls back to zoom zero before the canvas has a size', () => {
    expect(globeFitZoom(0, 0, 48.57)).toBe(0);
  });
});
