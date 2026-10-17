const COWSAY_MAX_WIDTH = 40;

const COW = String.raw`        \   ^__^
         \  (oo)\_______
            (__)\       )\/\
                ||----w |
                ||     ||`;

function repeatJoined(text: string, count: number, separator: string): string {
  return Array<string>(count).fill(text).join(separator);
}

export function cakeArt(candles: number): string {
  const innerWidth = 2 * candles + 3;
  const flames = `   ${repeatJoined('i', candles, ' ')}`;
  const wicks = `   ${repeatJoined('|', candles, ' ')}`;
  const top = ` __${repeatJoined('|', candles, '_')}__`;
  const icing = `|${'~'.repeat(innerWidth)}|`;
  const sprinkles = `|${' *'.repeat(candles + 1)} |`;
  const bottom = `|${'_'.repeat(innerWidth)}|`;
  return [flames, wicks, top, icing, sprinkles, bottom].join('\n');
}

function wrapWords(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    if (current === '') {
      current = word;
      continue;
    }

    if (current.length + 1 + word.length > width) {
      lines.push(current);
      current = word;
      continue;
    }

    current = `${current} ${word}`;
  }

  lines.push(current);

  return lines;
}

function bubbleEdges(index: number, count: number): [string, string] {
  if (count === 1) return ['<', '>'];

  if (index === 0) return ['/', '\\'];

  if (index === count - 1) return ['\\', '/'];

  return ['|', '|'];
}

export function cowsayArt(text: string): string {
  const lines = wrapWords(text, COWSAY_MAX_WIDTH);
  let width = 0;
  for (const line of lines) {
    width = Math.max(width, line.length);
  }

  const bubble: string[] = [` ${'_'.repeat(width + 2)}`];
  for (const [index, line] of lines.entries()) {
    const [left, right] = bubbleEdges(index, lines.length);
    bubble.push(`${left} ${line.padEnd(width)} ${right}`);
  }

  bubble.push(` ${'-'.repeat(width + 2)}`);
  bubble.push(COW);

  return bubble.join('\n');
}
