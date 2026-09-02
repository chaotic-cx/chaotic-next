import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { type DiffScanFinding } from '@chaotic-next/shared-lib';
import { type MergeRequestDiffSchema } from '@gitbeaker/core';

const DEFAULT_LLM_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_LLM_MODELS = [
  'minimax/minimax-m3:free',
  'cohere/north-mini-code:free',
  'google/gemma-4-31b-it:free',
] as const;
const TIMEOUT_MS = 30_000;
const MAX_PROMPT_CHARS = 12_000;

const SYSTEM_PROMPT = `You are a malware analyst for Arch Linux PKGBUILDs. Check the PKGBUILD and diff for supply-chain attacks, hidden downloads, obfuscated bash, credential theft, persistence, or typosquatting. Reply ONLY as JSON array: [{"ruleId":"LLM-001","severity":"critical|warning|info","file":"path","line":123,"match":"snippet","note":"reason"}] or [] if clean. Keep match <200 chars.`;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n... truncated` : text;
}

@Injectable()
export class LlmScanService {
  private readonly apiKey: string | undefined;
  private readonly apiUrl: string;
  private readonly models: readonly string[];
  private lastCallAt = 0;
  private queue: Promise<void> = Promise.resolve();
  private readonly cache = new Map<string, DiffScanFinding[]>();

  constructor(
    configService: ConfigService,
    @InjectPinoLogger(LlmScanService.name) private readonly pino: PinoLogger,
  ) {
    this.apiKey =
      configService.get<string>('LLM_API_KEY') ??
      configService.get<string>('OPENROUTER_API_KEY') ??
      process.env.LLM_API_KEY ??
      process.env.OPENROUTER_API_KEY;
    this.apiUrl = configService.get<string>('LLM_API_URL') ?? process.env.LLM_API_URL ?? DEFAULT_LLM_API_URL;
    const modelsEnv = configService.get<string>('LLM_MODELS') ?? process.env.LLM_MODELS;
    this.models = modelsEnv ? (modelsEnv.split(',').map((s) => s.trim()).filter(Boolean) as readonly string[]) : DEFAULT_LLM_MODELS;
  }

  get enabled(): boolean {
    return Boolean(this.apiKey);
  }

  async scan(diffs: MergeRequestDiffSchema[]): Promise<DiffScanFinding[]> {
    if (!this.enabled || diffs.length === 0) return [];
    const prompt = this.buildPrompt(diffs);
    const cacheKey = `${prompt.length}:${prompt.slice(0, 200)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const task = async (): Promise<DiffScanFinding[]> => {
      const waitMs = 6000 - (Date.now() - this.lastCallAt);
      if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
      this.lastCallAt = Date.now();
      try {
        if (!this.apiKey) return [];
        for (const model of this.models) {
          const res = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${this.apiKey}`,
              'HTTP-Referer': 'https://aur.chaotic.cx',
              'X-Title': 'Chaotic-AUR diff scan',
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt },
              ],
              temperature: 0.2,
              max_tokens: 2048,
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (res.status === 429) {
            this.pino.debug({ status: res.status, model }, 'LLM rate limited, trying next model');
            continue;
          }
          if (!res.ok) {
            this.pino.warn({ status: res.status, model }, 'LLM scan failed');
            return [];
          }
          const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
          const text = data.choices?.[0]?.message?.content?.trim() ?? '[]';
          return this.parseFindings(text, diffs);
        }
        return [];
      } catch (err) {
        if ((err as Error)?.name === 'TimeoutError') this.pino.debug({ err }, 'AI scan timeout');
        else this.pino.warn({ err }, 'AI scan error');
        return [];
      }
    };
    const queued = this.queue.then(task, task);
    this.queue = queued.then(() => undefined, () => undefined);
    return queued;
  }

  private parseFindings(text: string, diffs: MergeRequestDiffSchema[]): DiffScanFinding[] {
    const parsed = JSON.parse(text) as DiffScanFinding[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 10).map((finding) => ({
      ruleId: finding.ruleId ?? 'LLM-001',
      ruleName: 'LLM scan',
      severity: (finding.severity as DiffScanFinding['severity']) ?? 'warning',
      description: 'AI-detected suspicious pattern',
      file: finding.file ?? diffs[0]?.new_path ?? 'PKGBUILD',
      line: finding.line,
      match: (finding.match ?? '').slice(0, 200),
    } as unknown as DiffScanFinding));
  }

  private buildPrompt(diffs: MergeRequestDiffSchema[]): string {
    const parts = diffs.slice(0, 5).map((change) => `File: ${change.new_path}\nDiff:\n${truncate(change.diff, 3000)}`);
    return truncate(parts.join('\n\n---\n\n'), MAX_PROMPT_CHARS);
  }
}
