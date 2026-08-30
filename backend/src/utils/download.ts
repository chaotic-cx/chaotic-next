import { writeFile } from 'node:fs/promises';
import { type AxiosInstance } from 'axios';
import { CACHE_TTL_MS } from './constants';
import { sleep } from './functions';

const MAX_DOWNLOAD_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000;

export async function downloadFile(http: AxiosInstance, url: string, dest: string): Promise<void> {
  const response = await http.request({ url, method: 'GET', responseType: 'arraybuffer' });
  await writeFile(dest, Buffer.from(response.data));
}

export async function downloadWithRetry(
  http: AxiosInstance,
  url: string,
  dest: string,
  maxRetries = MAX_DOWNLOAD_RETRIES,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await downloadFile(http, url, dest);
      return;
    } catch (err: unknown) {
      lastError = err;
      if (attempt < maxRetries) {
        await sleep(Math.min(BASE_RETRY_DELAY_MS * 2 ** attempt, CACHE_TTL_MS));
      }
    }
  }
  throw lastError;
}
