import { CAUR_ALLOWED_CORS } from "@./shared-lib";
import type { INestApplication } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import { HttpAdapterHost, NestFactory } from "@nestjs/core";
import { AllExceptionsFilter } from "./all-exceptions/all-exceptions.filter";
import { AppModule } from "./app.module";
import { ConfigService } from "@nestjs/config";
import { checkEnvironment } from "./functions";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "@fastify/helmet";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Logger as PinoLogger } from "nestjs-pino";

process.env.NODE_ENV = process.env.NODE_ENV || "development";

async function bootstrap() {
    const corsOptions = {
        origin: CAUR_ALLOWED_CORS,
        methods: "GET",
    };

    const fastifyAdapter = new FastifyAdapter({ logger: true });
    const trustProxy: string = process.env.CAUR_TRUST_PROXY;

    const app: INestApplication = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter, {
        bufferLogs: true,
    });
    app.useLogger(app.get(PinoLogger));

    if (trustProxy !== undefined) {
        fastifyAdapter.options({ trustProxy: trustProxy });
    }
    fastifyAdapter.register(helmet);

    const configService: ConfigService = app.get<ConfigService>(ConfigService);
    checkEnvironment(configService);

    const { httpAdapter } = app.get(HttpAdapterHost);
    app.useGlobalFilters(new AllExceptionsFilter(httpAdapter));

    const config = new DocumentBuilder()
        .setTitle("Chaotic-AUR API")
        .setDescription("Chaotic-AUR API specification")
        .setVersion("1.0")
        .addTag("chaotic-aur")
        .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api", app, documentFactory);

    await app.listen(
        configService.get<string>("CAUR_PORT") || 3000,
        configService.get<string>("CAUR_HOST") || "0.0.0.0",
    );
}

bootstrap().then(() => {
    Logger.log("🚀 Application is running", "Bootstrap");
});
