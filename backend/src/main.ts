import { CAUR_ALLOWED_CORS } from "@./shared-lib";
import { Logger } from "@nestjs/common";
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
    const app = await NestFactory.create(AppModule, { cors: corsOptions });

    const configService = app.get<ConfigService>(ConfigService);
    checkEnvironment(configService);

    const { httpAdapter } = app.get(HttpAdapterHost);
    app.useGlobalFilters(new AllExceptionsFilter(httpAdapter));
    app.enableCors();

    await app.listen(configService.get<string>("CAUR_PORT"));
}

bootstrap().then(() => {
    Logger.log("🚀 Application is running", "Bootstrap");
});
