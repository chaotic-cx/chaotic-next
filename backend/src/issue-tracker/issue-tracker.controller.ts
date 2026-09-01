import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ApiBody, ApiHeaders, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { githubIssueEventSchema } from './issue-event.dto';
import { IssueTrackerService } from './issue-tracker.service';

const SIGNATURE_PREFIX = 'sha256=';

export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (signature === undefined || !signature.startsWith(SIGNATURE_PREFIX)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const provided = Buffer.from(signature.slice(SIGNATURE_PREFIX.length), 'hex');
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

@ApiTags('issue-tracker')
@Controller('issue-tracker')
export class IssueTrackerController {
  constructor(
    private readonly configService: ConfigService,
    private readonly issueTracker: IssueTrackerService,
    @InjectPinoLogger(IssueTrackerController.name) private readonly pino: PinoLogger,
  ) {}

  private runInBackground(action: string, job: Promise<unknown>): void {
    void job.catch((err: unknown) => this.pino.error({ err }, `Background ${action} failed`));
  }

  /** GitHub issues webhook. Signature-checked, then triaged in the background. */
  @Post('webhook')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Receive GitHub issue webhooks for request triage.' })
  @ApiHeaders([
    { name: 'X-GitHub-Event', description: 'GitHub webhook event name', required: true },
    { name: 'X-Hub-Signature-256', description: 'GitHub webhook HMAC signature', required: true },
  ])
  @ApiBody({ type: Object, description: 'GitHub issues webhook payload' })
  @ApiNoContentResponse({ description: 'Webhook accepted.' })
  async webhook(
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Headers('x-github-event') event: string | undefined,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: unknown,
  ): Promise<void> {
    const rawBody = request.rawBody;
    if (rawBody === undefined) throw new UnauthorizedException('Missing raw body', { errorCode: 'INVALID_SIGNATURE' });
    const secret = this.configService.getOrThrow<string>('GITHUB_WEBHOOK_SECRET');
    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      throw new UnauthorizedException('Invalid signature', { errorCode: 'INVALID_SIGNATURE' });
    }
    if (event === 'ping') return;
    if (event !== 'issues' && event !== 'issue_comment') return;
    const parsed = githubIssueEventSchema.safeParse(body);
    if (!parsed.success) return;
    this.runInBackground('issue triage', this.issueTracker.handleIssueEvent(parsed.data));
  }
}
