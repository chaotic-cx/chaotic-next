import type { ConfigService } from '@nestjs/config';
import constants from 'node:constants';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { access } from 'node:fs/promises';
import { BumpType } from '../interfaces/repo-manager';
import { requiredEnvVarsDev, requiredEnvVarsProd } from './constants';

export function generateNodeId(): string {
  // This prevents broker shutdowns due to double ids in case we have overlapping nodeIds.
  const randomString = Math.random().toString(36).substring(2, 7);

  if (process.env.HOSTNAME) return `${process.env.HOSTNAME}-${randomString}`;
  return `backend-${randomString}`;
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

export function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function bumpTypeToText(type: BumpType): string {
  switch (type) {
    case BumpType.EXPLICIT:
      return 'explicitly';
    case BumpType.GLOBAL:
      return 'globally';
    case BumpType.FROM_DEPS:
      return 'via Arch dependencies';
    case BumpType.FROM_DEPS_CHAOTIC:
      return 'via Chaotic dependencies';
    case BumpType.PLUGIN:
      return 'via a plugin ABI break';
    case BumpType.BROKEN_DEPS:
      return 'via a broken dependency';
    case BumpType.MANUAL:
      return 'manually';
    default:
      return 'Unknown';
  }
}

export function bumpTypeAdjectiveText(type: BumpType): string {
  switch (type) {
    case BumpType.EXPLICIT:
      return 'explicit';
    case BumpType.GLOBAL:
      return 'global';
    case BumpType.FROM_DEPS:
      return 'Arch dependency';
    case BumpType.FROM_DEPS_CHAOTIC:
      return 'Chaotic dependency';
    case BumpType.PLUGIN:
      return 'plugin ABI break';
    case BumpType.BROKEN_DEPS:
      return 'broken dependency';
    case BumpType.MANUAL:
      return 'manual';
    default:
      return 'Unknown';
  }
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

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function whitelistSort(sort: string, fallback: string, allowed: Record<string, string>): string {
  return allowed[sort] ?? fallback;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results = new Array<R>(items.length);
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
