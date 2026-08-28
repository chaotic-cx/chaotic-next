import { type INestApplication } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject, type SwaggerDocumentOptions } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { createSchema } from 'zod-openapi';

const documentOptions: SwaggerDocumentOptions = {
  standardSchemaConverter: (schema, { schemaType }) => {
    const converted = createSchema(schema as never, { io: schemaType, openapiVersion: '3.2.0' });
    return { schema: converted.schema, components: converted.components };
  },
};

export function provideSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setLicense('GPL-3.0', 'https://www.gnu.org/licenses/gpl-3.0.html')
    .setTitle('Chaotic-AUR API')
    .setDescription('Chaotic-AUR API specification')
    .setVersion('1.0')
    .setContact('Chaotic-AUR developers', 'https://aur.chaotic.cx/about', 'root@chaotic.cx')
    .addCookieAuth('better-auth.session_token')
    .setOpenAPIVersion('3.2.0')
    // OpenAPI 3.2 tag hierarchy: parent/kind come from the Tag Object and only
    // take effect when declared here, not on @ApiTags().
    .addTag('Packages', 'Package, build and repository data.')
    .addTag('builder', 'Build and package statistics.', undefined, { parent: 'Packages' })
    .addTag('repo', 'Repo manager and ELF signal index.', undefined, { parent: 'Packages' })
    .addTag('logs', 'Live build log streams.', undefined, { parent: 'Packages' })
    .addTag('admin', undefined, undefined, { parent: 'Packages' })
    .addTag('GitLab', 'GitLab pipeline, merge request and AUR integrations.')
    .addTag('gitlab', undefined, undefined, { parent: 'GitLab' })
    .addTag('aur', 'AUR package lookups.', undefined, { parent: 'GitLab' })
    .addTag('Metrics', 'Download and traffic metrics.')
    .addTag('metrics', undefined, undefined, { parent: 'Metrics' })
    .addTag('router', 'Router download statistics.', undefined, { parent: 'Metrics' })
    .addTag('events', 'Live event streams.', undefined, { parent: 'Metrics' })
    .addTag('System', 'Health checks and notifications.')
    .addTag('health', undefined, undefined, { parent: 'System' })
    .addTag('notifications', undefined, undefined, { parent: 'System' })
    .build();

  let cachedDocument: OpenAPIObject | undefined;
  const documentFactory = (): OpenAPIObject => {
    cachedDocument ??= SwaggerModule.createDocument(app, config, documentOptions);
    return cachedDocument;
  };

  const adapter = app.getHttpAdapter();

  // The reference UI must be an exact-path fastify route: registering it via
  // `app.use('/api/docs', ...)` creates an onRequest hook whose prefix match
  // also swallows /api/docs/json and answers it with HTML.
  if (adapter instanceof FastifyAdapter) {
    const fastify = adapter.getInstance();
    const sendSpec = (req: unknown, reply: { send: (data: unknown) => void }) => {
      void req;
      return reply.send(documentFactory());
    };
    fastify.get('/api/docs/json', sendSpec);
    fastify.get('/api/openapi.json', sendSpec);
    const reference = apiReference({
      url: '/api/docs/json',
      withFastify: true,
      layout: 'modern',
      theme: 'purple',
      hideClientButton: true,
      showSidebar: true,
      showDeveloperTools: 'never',
      operationTitleSource: 'summary',
      persistAuth: false,
      telemetry: false,
    });
    fastify.get('/api/docs', (req: FastifyRequest, reply: FastifyReply) => {
      // The reference handler writes to the raw response, so fastify must not
      // attempt its own send afterwards.
      reply.hijack();
      return reference(req, reply.raw);
    });
  }
}
