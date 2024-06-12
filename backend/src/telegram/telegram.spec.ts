import { TelegramModule } from "./telegram.module"

describe("Metrics", () => {
    it("should be defined", () => {
        expect(new TelegramModule()).toBeDefined()
    })
})
