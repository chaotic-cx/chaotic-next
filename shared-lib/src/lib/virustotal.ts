export function vtIndicatorLink(indicator: { type: string; value: string }): string {
  if (indicator.type !== 'url') {
    return `https://www.virustotal.com/gui/file/${indicator.value}`;
  }
  return `https://www.virustotal.com/gui/search?query=${encodeURIComponent(indicator.value)}`;
}
