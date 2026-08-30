import { BumpType } from '../interfaces/repo-manager';
import { requiredEnvVarsDev, requiredEnvVarsProd } from './constants';
import { type ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export function generateNodeId(): string {
  // HOSTNAME separates hosts. PIDs are unique among all simultaneously running
  // processes of one host, so two live brokers never share a nodeID.
  if (process.env.HOSTNAME) return `${process.env.HOSTNAME}-${process.pid}`;
  return `backend-${process.pid}`;
}

export function checkEnvironment(configService: ConfigService): void {
  const required: string[] =
    configService.get<string>('NODE_ENV') === 'development' ? requiredEnvVarsDev : requiredEnvVarsProd;
  const missingEnvVars: string[] = required.filter((envVar) => !configService.get<string>(envVar));

  if (missingEnvVars.length > 0) {
    throw new Error(`Missing environment variables: ${missingEnvVars.join(', ')}`);
  }
}

export function nDaysInPast(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

export function utcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** UTC midnight of the day `days` ago — the common cutoff for daily-rollup queries. */
export function utcCutoffDaysAgo(days: number): Date {
  return utcDayStart(nDaysInPast(days));
}

export function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const BUMP_TYPE_TEXT: Record<BumpType, string> = {
  [BumpType.EXPLICIT]: 'explicitly',
  [BumpType.GLOBAL]: 'globally',
  [BumpType.FROM_DEPS]: 'via Arch dependencies',
  [BumpType.FROM_DEPS_CHAOTIC]: 'via Chaotic dependencies',
  [BumpType.PLUGIN]: 'via a plugin ABI break',
  [BumpType.BROKEN_DEPS]: 'via a broken dependency',
  [BumpType.MANUAL]: 'manually',
};

export function bumpTypeToText(type: BumpType): string {
  return BUMP_TYPE_TEXT[type] ?? 'Unknown';
}

const BUMP_TYPE_ADJECTIVE_TEXT: Record<BumpType, string> = {
  [BumpType.EXPLICIT]: 'explicit',
  [BumpType.GLOBAL]: 'global',
  [BumpType.FROM_DEPS]: 'Arch dependency',
  [BumpType.FROM_DEPS_CHAOTIC]: 'Chaotic dependency',
  [BumpType.PLUGIN]: 'plugin ABI break',
  [BumpType.BROKEN_DEPS]: 'broken dependency',
  [BumpType.MANUAL]: 'manual',
};

export function bumpTypeAdjectiveText(type: BumpType): string {
  return BUMP_TYPE_ADJECTIVE_TEXT[type] ?? 'Unknown';
}

const SALTED_PREFIX = Buffer.from('Salted__', 'utf8');

function evpBytesToKey(password: string, salt: Buffer): { key: Buffer; iv: Buffer } {
  const keyLen = 32;
  const ivLen = 16;
  let previous = Buffer.alloc(0);
  let derived = Buffer.alloc(0);
  while (derived.length < keyLen + ivLen) {
    const hashInput = Buffer.concat([previous, Buffer.from(password, 'utf8'), salt]);
    previous = createHash('md5').update(hashInput).digest();
    derived = Buffer.concat([derived, previous]);
  }
  return { key: derived.subarray(0, keyLen), iv: derived.subarray(keyLen, keyLen + ivLen) };
}

export function encryptAesRaw(value: string, key: string): string {
  const salt = randomBytes(8);
  const { key: derivedKey, iv } = evpBytesToKey(key, salt);
  const cipher = createCipheriv('aes-256-cbc', derivedKey, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(value, 'utf8')), cipher.final()]);
  return Buffer.concat([SALTED_PREFIX, salt, encrypted]).toString('base64');
}

export function decryptAesRaw(value: string, key: string): string {
  const salted = Buffer.from(value, 'base64');
  if (salted.length < 16 || !salted.subarray(0, 8).equals(SALTED_PREFIX)) {
    throw new Error('Invalid encrypted data');
  }
  const { key: derivedKey, iv } = evpBytesToKey(key, salted.subarray(8, 16));
  const decipher = createDecipheriv('aes-256-cbc', derivedKey, iv);
  const decrypted = Buffer.concat([decipher.update(salted.subarray(16)), decipher.final()]);
  return decrypted.toString('utf8');
}

export function encryptAes(value: string, key: string) {
  return Buffer.from(encryptAesRaw(JSON.stringify(value), key), 'utf8').toString('base64');
}

export function decryptAes(value: string, key: string): string {
  return JSON.parse(decryptAesRaw(Buffer.from(value, 'base64').toString('utf8'), key)) as string;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function rejectedReasons(results: PromiseSettledResult<unknown>[]): unknown[] {
  return results.filter((result) => result.status === 'rejected').map((result) => result.reason);
}

export function whitelistSort(sort: string, fallback: string, allowed: Record<string, string>): string {
  return allowed[sort] ?? fallback;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export function errorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('code' in err)) return undefined;
  const code = (err as { code: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * We must not merge MRs while scheduled build pipelines are running.
 * Scheduled (every 3 hours) between HH:30 and HH:40 UTC.
 */
export function isOnSchedulePipelineRunning(date = new Date()): boolean {
  const utcHours = date.getUTCHours();
  const utcMinutes = date.getUTCMinutes();
  return utcHours % 3 === 0 && utcMinutes >= 30 && utcMinutes <= 40;
}
