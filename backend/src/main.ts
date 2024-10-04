import { CAUR_ALLOWED_CORS, CAUR_BACKEND_PORT } from "@./shared-lib"
import { Logger } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module"

async function bootstrap() {
    const corsOptions = {
        origin: CAUR_ALLOWED_CORS,
        methods: "GET",
    }
    const app = await NestFactory.create(AppModule, { cors: corsOptions })
    app.enableCors()
    await app.listen(CAUR_BACKEND_PORT)
}

bootstrap().then(() => {
    Logger.log(
        `🚀 Application is running on: http://localhost:${CAUR_BACKEND_PORT}`,
        "Bootstrap",
    )
})
