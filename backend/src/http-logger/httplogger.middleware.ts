import { Injectable, Logger, type NestMiddleware } from "@nestjs/common"
import type { NextFunction, Request, Response } from "express"

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
    private logger: Logger = new Logger("HttpLogger")

    use(request: Request, response: Response, next: NextFunction): void {
        // Prepare timing request answer
        const startAt: [number, number] = process.hrtime()

        // Prepare logging request
        setImmediate(async () => {
            const requestLog = {
                ip: request.ip,
                method: request.method,
                path: request.path,
                queryParams: request.query,
                userAgent: request.get("User-Agent"),
            }
            this.logger.log(`Request: ${JSON.stringify(requestLog)}`)
        })

        // Extract response's body
        let body = {}
        const chunks = []
        const oldEnd = response.end
        response.end = (chunk: any) => {
            if (chunk) {
                chunks.push(Buffer.from(chunk))
            }
            body = Buffer.concat(chunks).toString("utf8")
            return oldEnd.call(response, body)
        }

        // Log response
        response.on("finish", async () => {
            const contentLength = response.get("content-length")
            const diff = process.hrtime(startAt)
            const responseTime = diff[0] * 1e3 + diff[1] * 1e-6

            return setTimeout(() => {
                const responseLog = {
                    contentLength: contentLength,
                    method: request.method,
                    path: request.path,
                    statusCode: response.statusCode,
                    responseTime: `${responseTime.toFixed(2)}ms`,
                }
                this.logger.log(`Response: ${JSON.stringify(responseLog)}`)
            }, 0)
        })

        next()
    }
}
