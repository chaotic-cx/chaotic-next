import type { AccentName } from '@catppuccin/palette';
import { paletteColor } from '../theme';

type Confetti = typeof import('canvas-confetti');

const CONFETTI_PARTICLE_COUNT = 160;
const CONFETTI_SPREAD_DEGREES = 80;

const CONFETTI_ORIGIN_Y = 0.3;

const CONFETTI_COLOR_NAMES: readonly AccentName[] = ['mauve', 'peach', 'yellow', 'green', 'sky'];

async function loadConfetti(): Promise<Confetti | null> {
  try {
    const confettiModule = await import('canvas-confetti');
    return confettiModule.default;
  } catch {
    return null;
  }
}

/**
 * Starts one confetti burst in the colours of the active flavour. It does not wait for the animation to end.
 * Returns false when the confetti chunk does not load. The confetti is decoration, so the caller can ignore that.
 */
export async function burstConfetti(): Promise<boolean> {
  const confetti = await loadConfetti();
  if (!confetti) return false;

  void confetti({
    particleCount: CONFETTI_PARTICLE_COUNT,
    spread: CONFETTI_SPREAD_DEGREES,
    origin: { y: CONFETTI_ORIGIN_Y },
    colors: CONFETTI_COLOR_NAMES.map(paletteColor),
    disableForReducedMotion: true,
  });

  return true;
}
