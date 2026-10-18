import { themePalette } from '../theme';

const FLASH_ALPHA = 0.38;
const FLASH_IN_OFFSET = 0.2;
const FLASH_OUT_OFFSET = 0.65;

/**
 * Keyframes that tint a revealed row with the accent colour of the active flavour, hold it, then fade it out.
 * The diff view and the source view use the same flash.
 */
export function lineFlashKeyframes(): Keyframe[] {
  const { r, g, b } = themePalette().mauve.rgb;
  const hidden = `inset 0 0 0 999px rgb(${r} ${g} ${b} / 0)`;
  const visible = `inset 0 0 0 999px rgb(${r} ${g} ${b} / ${FLASH_ALPHA})`;

  return [
    { boxShadow: hidden },
    { boxShadow: visible, offset: FLASH_IN_OFFSET },
    { boxShadow: visible, offset: FLASH_OUT_OFFSET },
    { boxShadow: hidden },
  ];
}
