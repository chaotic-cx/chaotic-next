import { HttpLoggerMiddleware } from "./httplogger.middleware"

describe("HttpLoggerMiddleware", () => {
    it("should be defined", () => {
        expect(new HttpLoggerMiddleware()).toBeDefined()
    })
})
