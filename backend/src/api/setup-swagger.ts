import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

export function provideSwagger(app: INestApplication): void {
    const config = new DocumentBuilder()
        .setLicense("GPL-3.0", "https://www.gnu.org/licenses/gpl-3.0.html")
        .setTitle("Chaotic-AUR API")
        .setDescription("Chaotic-AUR API specification")
        .setVersion("1.0")
        .addTag("chaotic-aur")
        .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api", app, documentFactory);
}
