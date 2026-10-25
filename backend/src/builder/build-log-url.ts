export interface LogRef {
  pkgname: string;
  timestamp: string;
}

export function parseLogRef(logUrl: string): LogRef | null {
  try {
    const url = new URL(logUrl);
    const pkgname = url.searchParams.get('id') ?? url.searchParams.get('pkgname');
    const timestamp = url.searchParams.get('timestamp');
    if (pkgname !== null && timestamp !== null) return { pkgname, timestamp };
  } catch {
    // Malformed log URL. Fall through to the path-based reading below.
  }

  const segments = logUrl.split('/').filter(Boolean);
  const [pkgname, timestamp] = segments.slice(-2);
  if (pkgname && timestamp) return { pkgname, timestamp };

  return null;
}

export function rawLogUrl(base: string, ref: LogRef): string {
  return `${base}/${encodeURIComponent(ref.pkgname)}/${ref.timestamp}`;
}
