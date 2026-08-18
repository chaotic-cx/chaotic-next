import { ThrottlerGuard } from '@nestjs/throttler';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: { ips?: string[]; ip?: string }): Promise<string> {
    return req.ips?.[0] ?? req.ip ?? 'unknown';
  }
}
