import { computed } from '@angular/core';
import { flavour, LIGHT_FLAVOUR } from './theme';

// The original artwork has pale gradients made for dark canvases. Latte uses a variant with deepened gradients.
export const lightLogo = computed(() => flavour() === LIGHT_FLAVOUR);
