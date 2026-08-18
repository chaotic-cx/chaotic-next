import { registerAs } from '@nestjs/config';

export default registerAs('vt', () => ({
  apiKey: process.env.VIRUSTOTAL_API_KEY,
  /** Free-tier quota is 4 requests per minute, so lookups are spaced by default. */
  requestSpacingMs: Number(process.env.VIRUSTOTAL_REQUEST_SPACING_MS ?? 15_000),
  pollIntervalMs: Number(process.env.VIRUSTOTAL_POLL_INTERVAL_MS ?? 20_000),
}));
