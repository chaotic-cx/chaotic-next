import { flavors } from '@catppuccin/palette';
import { CatppuccinAura } from '@garudalinux/themes/catppuccin';
import { definePreset } from '@openng/optimus-ui-themes';

const latte = flavors.latte.colors;

// The same translucent fill as --chaotic-surface in styles.css, so the blur stays visible.
const LATTE_CONTENT_BACKGROUND = 'var(--chaotic-surface)';

// Inputs sit lighter than the canvas, but stay translucent like the cards.
const LATTE_FIELD_BACKGROUND = 'rgb(255 255 255 / 0.7)';

const LATTE_MASK_BACKGROUND = `color-mix(in srgb, ${latte.text.hex} 25%, transparent)`;

/**
 * Light ramp from the Latte palette: 0 is the lightest, 950 is the text colour.
 * The upstream preset keeps its dark ramp in light mode, so light inputs and borders rendered dark.
 */
const LATTE_SURFACE = {
  0: '#ffffff',
  50: latte.base.hex,
  100: latte.mantle.hex,
  200: latte.crust.hex,
  300: latte.surface0.hex,
  400: latte.surface1.hex,
  500: latte.surface2.hex,
  600: latte.overlay1.hex,
  700: latte.overlay2.hex,
  800: latte.subtext0.hex,
  900: latte.subtext1.hex,
  950: latte.text.hex,
};

const latteScheme = {
  surface: LATTE_SURFACE,
  primary: {
    color: latte.mauve.hex,
    contrastColor: latte.base.hex,
    hoverColor: latte.maroon.hex,
    activeColor: latte.flamingo.hex,
  },
  highlight: {
    background: '{content.background}',
    focusBackground: '{content.background}',
    color: latte.red.hex,
    focusColor: latte.maroon.hex,
  },
  mask: {
    background: LATTE_MASK_BACKGROUND,
    color: '{surface.950}',
  },
  formField: {
    background: LATTE_FIELD_BACKGROUND,
    disabledBackground: '{surface.200}',
    filledBackground: '{surface.50}',
    filledHoverBackground: '{surface.50}',
    filledFocusBackground: '{surface.0}',
    borderColor: '{surface.400}',
    hoverBorderColor: '{surface.500}',
    focusBorderColor: '{primary.color}',
    invalidBorderColor: latte.red.hex,
    color: latte.text.hex,
    disabledColor: '{surface.600}',
    placeholderColor: latte.subtext0.hex,
    invalidPlaceholderColor: latte.red.hex,
    floatLabelColor: latte.subtext0.hex,
    floatLabelFocusColor: '{primary.color}',
    floatLabelActiveColor: latte.subtext0.hex,
    floatLabelInvalidColor: '{form.field.invalid.placeholder.color}',
    iconColor: latte.subtext0.hex,
  },
  text: {
    color: latte.text.hex,
    hoverColor: latte.maroon.hex,
    mutedColor: latte.subtext0.hex,
    hoverMutedColor: latte.subtext1.hex,
  },
  content: {
    background: LATTE_CONTENT_BACKGROUND,
    hoverBackground: '{surface.100}',
    borderColor: '{surface.300}',
    color: '{text.color}',
    hoverColor: '{text.hover.color}',
  },
  overlay: {
    select: {
      background: '{surface.50}',
      borderColor: '{surface.300}',
      color: '{text.color}',
    },
    popover: {
      background: '{surface.50}',
      borderColor: '{surface.300}',
      color: '{text.color}',
    },
    modal: {
      background: '{surface.50}',
      borderColor: '{surface.300}',
      color: '{text.color}',
    },
  },
  list: {
    option: {
      focusBackground: '{surface.100}',
      selectedBackground: '{highlight.background}',
      selectedFocusBackground: '{highlight.focus.background}',
      color: '{text.color}',
      focusColor: '{text.hover.color}',
      selectedColor: '{highlight.color}',
      selectedFocusColor: '{highlight.focus.color}',
      icon: {
        color: '{surface.800}',
        focusColor: '{surface.900}',
      },
    },
    optionGroup: {
      background: 'transparent',
      color: '{text.muted.color}',
    },
  },
  navigation: {
    item: {
      focusBackground: '{surface.100}',
      activeBackground: '{surface.100}',
      color: '{text.color}',
      focusColor: '{text.hover.color}',
      activeColor: '{text.hover.color}',
      icon: {
        color: '{surface.800}',
        focusColor: '{surface.900}',
        activeColor: '{surface.900}',
      },
    },
    submenuLabel: {
      background: 'transparent',
      color: '{text.muted.color}',
    },
    submenuIcon: {
      color: '{surface.800}',
      focusColor: '{surface.900}',
      activeColor: '{surface.900}',
    },
  },
};

// Component tokens follow the design token types (`root`, `overlay`, `option`). Each one only touches the light scheme.
const latteComponents = {
  card: {
    colorScheme: { light: { root: { background: LATTE_CONTENT_BACKGROUND } } },
  },
  inputtext: {
    colorScheme: {
      light: {
        root: {
          background: '{form.field.background}',
          borderColor: '{form.field.border.color}',
        },
      },
    },
  },
  button: {
    colorScheme: {
      light: {
        root: {
          secondary: {
            background: LATTE_FIELD_BACKGROUND,
            hoverBackground: '{surface.0}',
            borderColor: '{surface.400}',
            hoverBorderColor: '{surface.500}',
            color: latte.text.hex,
            hoverColor: latte.mauve.hex,
          },
        },
      },
    },
  },
  select: {
    colorScheme: {
      light: {
        overlay: { background: '{surface.50}' },
        option: {
          focusBackground: '{surface.100}',
          selectedBackground: '{surface.200}',
        },
      },
    },
  },
  tooltip: {
    colorScheme: {
      light: {
        root: {
          background: latte.text.hex,
          color: latte.base.hex,
        },
      },
    },
  },
};

/**
 * CatppuccinAura with a real Latte light scheme. The dark (Mocha) scheme stays exactly as upstream.
 */
export const CATPPUCCIN_PRESET = definePreset(CatppuccinAura, {
  semantic: {
    colorScheme: {
      light: latteScheme,
    },
  },
  components: latteComponents,
});
