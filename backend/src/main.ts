import { CAUR_ALLOWED_CORS } from "@./shared-lib";
import helmet from "@fastify/helmet";
import type { INestApplication } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpAdapterHost, NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Logger as PinoLogger } from "nestjs-pino";
import { AllExceptionsFilter } from "./all-exceptions/all-exceptions.filter";
import { provideSwagger } from "./api/setup-swagger";
import { AppModule } from "./app.module";
import { checkEnvironment } from "./functions";

process.env.NODE_ENV = process.env.NODE_ENV || "development";
declare const module: any;

async function bootstrap(): Promise<void> {
    const fastifyAdapter = new FastifyAdapter();
    const app: INestApplication = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter, {
        bufferLogs: true,
    });
    app.useLogger(app.get(PinoLogger));

    const configService: ConfigService = app.get<ConfigService>(ConfigService);
    checkEnvironment(configService);

    const trustProxy: string = configService.get<string>(process.env.CAUR_TRUST_PROXY);
    if (trustProxy !== undefined) {
        fastifyAdapter.options({ trustProxy: trustProxy });
    }
    fastifyAdapter.register(helmet);

    const corsOptions = {
        origin: CAUR_ALLOWED_CORS,
        methods: "GET",
    };
    app.enableCors(corsOptions);

    const { httpAdapter } = app.get(HttpAdapterHost);
    app.useGlobalFilters(new AllExceptionsFilter(httpAdapter));

    // Provide the Swagger API documentation at /api
    provideSwagger(app);
    await app.listen(configService.get<number>("app.port"), configService.get<string>("app.host"));

    // Hot Module Replacement support
    if (module.hot) {
        module.hot.accept();
        module.hot.dispose(() => app.close());
    }
}

bootstrap().then(() => {
    Logger.log("🚀 Application has started up", "Bootstrap");
});
