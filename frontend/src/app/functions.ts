import { Meta } from '@angular/platform-browser';
import type { ChaoticEvent } from '@chaotic-next/shared-lib';

const CHAOTIC_EVENT_TYPES = new Set(['build', 'pipeline', 'merge_request', 'queue']);

export function isChaoticEvent(value: unknown): value is ChaoticEvent {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type: unknown }).type;
  return typeof type === 'string' && CHAOTIC_EVENT_TYPES.has(type);
}

export function shuffleArray<T>(array: readonly T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i >= 0; i--) {
    const j: number = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  return shuffled;
}

export function castTo<T>(value: unknown): T {
  return value as T;
}

export function range(count: number): number[] {
  return Array.from({ length: count }, (ignored, index) => index + 1);
}

export function parseCount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface SeoTags {
  title: string;
  description: string;
  keywords: string;
  url: string;
  image?: string;
}

export function updateSeoTags(meta: Meta, seo: SeoTags): void {
  meta.updateTag({ name: 'description', content: seo.description });
  meta.updateTag({ name: 'keywords', content: seo.keywords });
  meta.updateTag({ property: 'og:title', content: seo.title });
  meta.updateTag({ property: 'og:description', content: seo.description });
  meta.updateTag({ property: 'og:url', content: seo.url });
  if (seo.image) meta.updateTag({ property: 'og:image', content: seo.image });
}

export async function encrypt(plaintext: string, password: string) {
  const ptUtf8 = new TextEncoder().encode(plaintext);
  const pwUtf8 = new TextEncoder().encode(password);
  const pwHash = await window.crypto.subtle.digest('SHA-256', pwUtf8);

  const iv = window.crypto.getRandomValues(new Uint8Array(16));
  const alg = { name: 'AES-CBC', iv: iv };
  const key = await window.crypto.subtle.importKey('raw', pwHash, alg, false, ['encrypt']);

  const ctBuffer = await window.crypto.subtle.encrypt(alg, key, ptUtf8);
  const ctArray = new Uint8Array(ctBuffer);
  const ctBase64 = btoa(String.fromCharCode(...ctArray));

  const ivHex = Array.from(iv)
    .map((b) => ('00' + b.toString(16)).slice(-2))
    .join('');
  return ivHex + ctBase64;
}

export async function decrypt(ciphertext: string, password: string) {
  const ivHex = ciphertext.slice(0, 32);
  const ctBase64 = ciphertext.slice(32);

  const ivBytes = ivHex.match(/.{1,2}/g);
  if (!ivBytes) {
    throw new Error('Invalid ciphertext: missing IV');
  }
  const iv = new Uint8Array(ivBytes.map((byte: string) => parseInt(byte, 16)));

  const ctStr = atob(ctBase64);
  const ctArray = new Uint8Array(ctStr.split('').map((c) => c.charCodeAt(0)));

  const pwUtf8 = new TextEncoder().encode(password);
  const pwHash = await window.crypto.subtle.digest('SHA-256', pwUtf8);

  const alg = { name: 'AES-CBC', iv: iv };
  const key = await window.crypto.subtle.importKey('raw', pwHash, alg, false, ['decrypt']);

  const ptBuffer = await window.crypto.subtle.decrypt(alg, key, ctArray);
  return new TextDecoder().decode(ptBuffer);
}
