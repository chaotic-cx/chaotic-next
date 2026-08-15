import type { INestApplication } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';

export function provideSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setLicense('GPL-3.0', 'https://www.gnu.org/licenses/gpl-3.0.html')
    .setTitle('Chaotic-AUR API')
    .setDescription('Chaotic-AUR API specification')
    .setVersion('1.0')
    .setContact('Chaotic-AUR developers', 'https://aur.chaotic.cx/about', 'root@chaotic.cx')
    .build();

  const openApiSpecification = SwaggerModule.createDocument(app, config);
  const adapter = app.getHttpAdapter();

  if (adapter instanceof FastifyAdapter) {
    const fastify = adapter.getInstance();
    const sendSpec = (req: unknown, reply: { send: (data: unknown) => void }) => reply.send(openApiSpecification);
    fastify.get('/api/docs/json', sendSpec);
    fastify.get('/api/openapi.json', sendSpec);
  }

  app.use(
    '/api/docs',
    apiReference({
      content: openApiSpecification,
      withFastify: true,
      layout: 'modern',
      theme: 'purple',
      hideClientButton: true,
      showSidebar: true,
      showDeveloperTools: 'never',
      operationTitleSource: 'summary',
      persistAuth: false,
      telemetry: false,
    }),
  );
}
