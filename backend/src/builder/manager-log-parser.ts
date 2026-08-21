const FILTERED_MODULES = new Set(['HTTP']);

const LEVEL_COLORS: Record<string, string> = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m', // green
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
  fatal: '\x1b[31;1m', // bold red
};

const MODULE_COLORS: Record<string, string> = {
  BUILD: '\x1b[35m', // magenta
  CHAOTIC: '\x1b[36m', // cyan
  DATABASE: '\x1b[33m', // yellow
  REDIS: '\x1b[31m', // red
  SERVICE: '\x1b[32m', // green
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

interface ManagerLogEntry {
  level?: string;
  mod?: string;
  msg?: string;
  seq?: number;
  ts?: number;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString();
}

function padLevel(level: string): string {
  return level.toUpperCase().padEnd(5);
}

export function parseManagerLogEvent(dataLine: string): string | undefined {
  const payload = dataLine.slice(6);
  try {
    const parsed = JSON.parse(payload) as ManagerLogEntry;
    if (parsed.mod && FILTERED_MODULES.has(parsed.mod)) {
      return undefined;
    }
    if (parsed.msg) {
      const ts = parsed.ts ? `${DIM}${formatTimestamp(parsed.ts)}${RESET}` : '';
      const level = parsed.level ? padLevel(parsed.level) : '';
      const levelColor = parsed.level ? (LEVEL_COLORS[parsed.level] ?? '') : '';
      const mod = parsed.mod ?? '';
      const modColor = MODULE_COLORS[mod] ?? '';

      const tsPart = ts ? `${ts} ` : '';
      const levelPart = level ? `${BOLD}${levelColor}${level}${RESET} ` : '';
      const modPart = mod ? `${modColor}${mod}${RESET}: ` : '';

      return `${tsPart}${levelPart}${modPart}${parsed.msg}\n`;
    }
    return undefined;
  } catch {
    return payload + '\n';
  }
}
