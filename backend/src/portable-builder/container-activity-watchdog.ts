import { hasUsageChanged, type ContainerUsage } from './container-usage';

export const DEFAULT_POLL_INTERVAL_MS = 15_000;

export interface ContainerActivityWatchdogOptions {
  /** Samples the current usage of the watched container; null when sampling failed. */
  getUsage: () => Promise<ContainerUsage | null>;
  idleTimeoutMs: number;
  pollIntervalMs?: number;
  /**
   * Called with every successfully sampled usage snapshot, e.g. to collect build statistics.
   * Invoked before the idle evaluation, so it also fires for the final sample of a killed build.
   */
  onSample?: (usage: ContainerUsage) => void;
  /**
   * Called at most once, right before the idle container is expected to be killed. Receives the
   * most recently sampled usage snapshot so it can be included in log output.
   */
  onTimeout: (lastUsage: ContainerUsage) => void;
}

/**
 * Watches the resource usage of a running container to detect builds that got stuck entirely,
 * e.g. waiting forever on user input which is never going to happen. Ported from
 * chaotic-manager's ContainerActivityWatchdog so both builders behave identically.
 */
export class ContainerActivityWatchdog {
  private readonly options: ContainerActivityWatchdogOptions;
  private timer: NodeJS.Timeout | null = null;
  private lastActiveUsage: ContainerUsage | null = null;
  private lastActivityAt = Date.now();
  private probeInFlight = false;
  private stopped = false;

  constructor(options: ContainerActivityWatchdogOptions) {
    this.options = options;
  }

  start(): void {
    void this.probe();

    this.timer = setInterval(() => void this.probe(), this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);

    // A watched build must never keep the backend process alive on its own
    this.timer.unref();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async probe(): Promise<void> {
    if (this.stopped || this.probeInFlight) return;
    this.probeInFlight = true;
    try {
      const usage = await this.options.getUsage().catch(() => null);
      if (this.stopped || !usage) return;

      this.options.onSample?.(usage);

      if (!this.lastActiveUsage || hasUsageChanged(this.lastActiveUsage, usage)) {
        this.lastActiveUsage = usage;
        this.lastActivityAt = Date.now();
        return;
      }

      if (Date.now() - this.lastActivityAt >= this.options.idleTimeoutMs) {
        this.stop();
        this.options.onTimeout(usage);
      }
    } finally {
      this.probeInFlight = false;
    }
  }
}
