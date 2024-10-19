import { ArgumentsHost, Catch, HttpException, HttpStatus } from "@nestjs/common"
import { BaseExceptionFilter } from "@nestjs/core"

@Catch()
export class CatchallFilter extends BaseExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void {
        super.catch(exception, host)

        const { httpAdapter } = this.httpAdapterHost

        const ctx = host.switchToHttp()

        const httpStatus =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR

        const responseBody = {
            statusCode: httpStatus,
            timestamp: new Date().toISOString(),
            path: httpAdapter.getRequestUrl(ctx.getRequest()),
        }

        httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus)
    }
}
