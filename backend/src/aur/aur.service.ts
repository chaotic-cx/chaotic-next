import { Injectable, Logger } from '@nestjs/common';
import { errorMessage } from '../utils/functions';

const AUR_SUGGEST_URL = 'https://aur.archlinux.org/rpc/v5/suggest';
const AUR_TIMEOUT_MS = 5000;
const MAX_SUGGESTIONS = 20;

@Injectable()
export class AurService {
  private readonly logger = new Logger(AurService.name);

  /** AUR name suggestions for autocomplete, best-effort: failures return none. */
  async getSuggestions(query: string): Promise<string[]> {
    try {
      const response = await fetch(`${AUR_SUGGEST_URL}/${encodeURIComponent(query)}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(AUR_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(`AUR suggest returned ${response.status}`);
        return [];
      }
      const data: unknown = await response.json();
      if (!Array.isArray(data)) return [];
      return data.filter((item): item is string => typeof item === 'string').slice(0, MAX_SUGGESTIONS);
    } catch (err) {
      this.logger.warn(`AUR suggest failed: ${errorMessage(err)}`);
      return [];
    }
  }
}
