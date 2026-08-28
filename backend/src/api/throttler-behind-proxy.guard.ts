import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: { ips?: string[]; ip?: string }): Promise<string> {
    return req.ips?.[0] ?? req.ip ?? 'unknown';
  }
}
