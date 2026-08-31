import { schemaResponse, schemaResponseArray } from '../api/response-schema';
import { idParamSchema } from '@chaotic-next/shared-lib';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@thallesp/nestjs-better-auth';
import { ApiAcceptedResponse, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { createReadStream } from 'node:fs';
import { GITLAB_GROUP_CHAOTIC_AUR } from '../auth/gitlab-groups';
import { RequireGroupGuard } from '../guards/require-group.guard';
import { RequireGroups } from '../decorators/require-groups.decorator';
import {
  enqueueBuildBodySchema,
  listBuildsQuerySchema,
  portableBuildSchema,
  type EnqueueBuildBodyDto,
  type ListBuildsQueryDto,
} from './portable-builder.dto';
import { PortableBuilderService } from './portable-builder.service';

@ApiTags('portable-builder')
@Controller('portable-builder')
export class PortableBuilderController {
  constructor(private readonly builder: PortableBuilderService) {}

  @Get('builds')
  @ApiOperation({ summary: 'List queued and finished portable test builds.' })
  @ApiOkResponse({
    description: 'Paginated list of portable builds',
    schema: schemaResponseArray(portableBuildSchema).schema,
  })
  listBuilds(@Query({ schema: listBuildsQuerySchema }) query: ListBuildsQueryDto) {
    return this.builder.listBuilds(query.page, query.perPage, query.pkgbase, query.status);
  }

  @Get('builds/:id')
  @ApiOperation({ summary: 'Status, log, and outcome of one portable test build.' })
  @ApiOkResponse({ description: 'The portable build', schema: schemaResponse(portableBuildSchema).schema })
  async getBuild(@Param('id', { schema: idParamSchema }) id: number) {
    return this.builder.getBuild(id);
  }

  @Get('builds/:id/log')
  @ApiOperation({ summary: 'Download the full, uncapped build log.' })
  @ApiOkResponse({ description: 'The full build log', schema: { type: 'string', format: 'binary' } })
  @ApiProduces('text/plain')
  async getLog(
    @Param('id', { schema: idParamSchema }) id: number,
    @Res() reply: FastifyReply,
  ): Promise<StreamableFile | void> {
    const logPath = await this.builder.getLogPath(id);
    if (logPath === null) throw new NotFoundException('No log stored for this build');
    return reply.type('text/plain; charset=utf-8').send(createReadStream(logPath));
  }

  @Get('builds/:id/artifacts/:name')
  @ApiOperation({ summary: 'Download one built package artifact.' })
  @ApiOkResponse({ description: 'The package artifact', schema: { type: 'string', format: 'binary' } })
  @ApiProduces('application/octet-stream')
  async getArtifact(
    @Param('id', { schema: idParamSchema }) id: number,
    @Param('name') name: string,
    @Res() reply: FastifyReply,
  ): Promise<StreamableFile | void> {
    const artifactPath = await this.builder.getArtifactPath(id, name);
    if (artifactPath === null) throw new NotFoundException('No such artifact for this build');
    return reply.type('application/octet-stream').send(createReadStream(artifactPath));
  }

  @Post('builds')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(AuthGuard, RequireGroupGuard)
  @RequireGroups(GITLAB_GROUP_CHAOTIC_AUR)
  @ApiOperation({ summary: 'Queue a test build of one AUR pkgbase in the builder container.' })
  @ApiAcceptedResponse({ description: 'Build queued', schema: schemaResponse(portableBuildSchema).schema })
  enqueue(@Body({ schema: enqueueBuildBodySchema }) body: EnqueueBuildBodyDto) {
    return this.builder.enqueue(body.pkgbase, body.issueNumber ?? null);
  }
}
