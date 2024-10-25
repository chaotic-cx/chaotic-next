import { CAUR_ALLOWED_CORS } from "@./shared-lib";
import { type INestApplication, Logger } from "@nestjs/common";
import { HttpAdapterHost, NestFactory } from "@nestjs/core";
import { AllExceptionsFilter } from "./all-exceptions/all-exceptions.filter";
import { AppModule } from "./app.module";
import { ConfigService } from "@nestjs/config";
import { checkEnvironment } from "./functions";
import { ExpressAdapter } from "@nestjs/platform-express";

process.env.NODE_ENV = process.env.NODE_ENV || "development";

async function bootstrap() {
    const corsOptions = {
        origin: CAUR_ALLOWED_CORS,
        methods: "GET",
    };

    const expressAdapter = new ExpressAdapter();
    const trustProxy: string = process.env.CAUR_TRUST_PROXY;

    if (trustProxy !== undefined) {
        expressAdapter.set("trust proxy", trustProxy);
        Logger.log(`Trust proxy set to ${trustProxy}`, "Bootstrap");
    }

    const app: INestApplication = await NestFactory.create(AppModule, expressAdapter, { cors: corsOptions });
    const configService: ConfigService = app.get<ConfigService>(ConfigService);
    const { httpAdapter } = app.get(HttpAdapterHost);

    checkEnvironment(configService);
    app.useGlobalFilters(new AllExceptionsFilter(httpAdapter));
    app.enableCors();

    await app.listen(configService.get<string>("CAUR_PORT") || 3000);
}

bootstrap().then(() => {
    Logger.log("🚀 Application is running", "Bootstrap");
});
