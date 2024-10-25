import { CAUR_ALLOWED_CORS } from "@./shared-lib";
import { type INestApplication, Logger } from "@nestjs/common";
import { HttpAdapterHost, NestFactory } from "@nestjs/core";
import { AllExceptionsFilter } from "./all-exceptions/all-exceptions.filter";
import { AppModule } from "./app.module";
import { ConfigService } from "@nestjs/config";
import { checkEnvironment } from "./functions";

process.env.NODE_ENV = process.env.NODE_ENV || "development";

async function bootstrap() {
    const corsOptions = {
        origin: CAUR_ALLOWED_CORS,
        methods: "GET",
    };
    const app: INestApplication = await NestFactory.create(AppModule, { cors: corsOptions });
    const configService: ConfigService = app.get<ConfigService>(ConfigService);
    const { httpAdapter } = app.get(HttpAdapterHost);

    checkEnvironment(configService);
    app.useGlobalFilters(new AllExceptionsFilter(httpAdapter));
    app.enableCors();

    if (configService.get<string>("CAUR_TRUST_PROXY") !== undefined) {
        app.getHttpServer().set("trust proxy", configService.get<string>("CAUR_TRUST_PROXY"));
        Logger.log(`Trust proxy set to ${configService.get<string>("CAUR_TRUST_PROXY")}`, "Bootstrap");
    }

    await app.listen(configService.get<string>("CAUR_PORT"));
}

bootstrap().then(() => {
    Logger.log("🚀 Application is running", "Bootstrap");
});
