import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export function provideSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setLicense('GPL-3.0', 'https://www.gnu.org/licenses/gpl-3.0.html')
    .setTitle('Chaotic-AUR API')
    .setDescription('Chaotic-AUR API specification')
    .setVersion('1.0')
    .setContact('Chaotic-AUR developers', 'https://aur.chaotic.cx/about', 'root@chaotic.cx')
    .build();
  const documentFactory = (): OpenAPIObject => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);
}
