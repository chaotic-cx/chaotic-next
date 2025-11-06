import { Meta } from '@angular/platform-browser';

/**
 * Shuffle an array.
 * @param array The array to shuffle.
 * @returns The shuffled array.
 */
export function shuffleArray(array: any[]): any[] {
  for (let i = array.length - 1; i >= 0; i--) {
    const j: number = Math.floor(Math.random() * (i + 1));
    const temp: any = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array;
}

/**
 * Update the meta tags for the current page.
 */
export function updateSeoTags(
  meta: Meta,
  title: string,
  description: string,
  keywords: string,
  url: string,
  image?: string,
): void {
  meta.updateTag({ name: 'description', content: description });
  meta.updateTag({ name: 'keywords', content: keywords });
  meta.updateTag({ property: 'og:title', content: title });
  meta.updateTag({ property: 'og:description', content: description });
  meta.updateTag({ property: 'og:url', content: url });
  if (image) meta.updateTag({ property: 'og:image', content: image });
}

/**
 * Encrypts the given plaintext using the provided password.
 * @param plaintext The plaintext to encrypt.
 * @param password The password used for encryption.
 * @returns The encrypted ciphertext.
 */
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

/**
 * Decrypts the given ciphertext using the provided password.
 * @param ciphertext The ciphertext to decrypt.
 * @param password The password used for decryption.
 * @returns The decrypted plaintext.
 */
export async function decrypt(ciphertext: string, password: string) {
  const ivHex = ciphertext.slice(0, 32);
  const ctBase64 = ciphertext.slice(32);

  const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));

  const ctStr = atob(ctBase64);
  const ctArray = new Uint8Array(ctStr.split('').map((c) => c.charCodeAt(0)));

  const pwUtf8 = new TextEncoder().encode(password);
  const pwHash = await window.crypto.subtle.digest('SHA-256', pwUtf8);

  const alg = { name: 'AES-CBC', iv: iv };
  const key = await window.crypto.subtle.importKey('raw', pwHash, alg, false, ['decrypt']);

  const ptBuffer = await window.crypto.subtle.decrypt(alg, key, ctArray);
  return new TextDecoder().decode(ptBuffer);
}
