import type { Menu } from '@openng/optimus-ui/menu';

/**
 * Aligns the right edge of a popup menu with the right edge of its button.
 * By default the popup starts at the left edge of the button and runs out of the window.
 */
export function alignMenuEnd(menu: Menu): void {
  const popup: HTMLElement | undefined = menu.container;
  const button: HTMLElement | undefined = menu.target;
  if (popup === undefined || button === undefined) {
    return;
  }

  const buttonRight = button.getBoundingClientRect().right + window.scrollX;
  const popupLeft = Math.max(0, buttonRight - popup.offsetWidth);
  popup.style.insetInlineStart = `${popupLeft}px`;
}
