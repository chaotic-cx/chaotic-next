export interface WordSegment {
  text: string;
  changed: boolean;
}

interface WordToken {
  text: string;
  isSpace: boolean;
}

function tokenize(line: string): WordToken[] {
  const tokens: WordToken[] = [];
  for (const match of line.matchAll(/\w+|\s+|[^\w\s]/g)) {
    const token = match[0];
    tokens.push({ text: token, isSpace: token.trim().length === 0 });
  }
  return tokens;
}

function tokensEqual(a: WordToken, b: WordToken): boolean {
  if (a.isSpace && b.isSpace) return true;
  return a.text === b.text;
}

/** Marks which tokens of `b` are matched by an LCS against `a` (whitespace never counts as a change). */
function lcsMatched(a: WordToken[], b: WordToken[]): boolean[] {
  const width = b.length + 1;
  const length = (a.length + 1) * width;
  const table = new Int32Array(length);

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const cell = i * width + j;
      table[cell] = tokensEqual(a[i], b[j])
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const matched: boolean[] = new Array(b.length).fill(false);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (tokensEqual(a[i], b[j])) {
      matched[j] = true;
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return matched;
}

function toSegments(tokens: WordToken[], changed: (index: number) => boolean): WordSegment[] {
  const segments: WordSegment[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const isChanged = changed(index);
    const previous = segments[segments.length - 1];
    if (previous && previous.changed === isChanged) {
      previous.text += token.text;
    } else {
      segments.push({ text: token.text, changed: isChanged });
    }
  }
  return segments;
}

/** Word-level diff of a removed/added line pair; unchanged tokens stay unflagged. */
export function diffWords(oldLine: string, newLine: string): { removed: WordSegment[]; added: WordSegment[] } {
  const oldTokens = tokenize(oldLine);
  const newTokens = tokenize(newLine);
  const newMatched = lcsMatched(oldTokens, newTokens);

  const oldMatched = lcsMatched(newTokens, oldTokens);
  const oldIsChanged = (index: number) => !oldTokens[index].isSpace && !oldMatched[index];
  const newIsChanged = (index: number) => !newTokens[index].isSpace && !newMatched[index];

  return {
    removed: toSegments(oldTokens, oldIsChanged),
    added: toSegments(newTokens, newIsChanged),
  };
}
