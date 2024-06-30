import { TelegramModule } from "./telegram.module"

describe("Telegram", () => {
    it("should be defined", () => {
        expect(new TelegramModule()).toBeDefined()
    })
})
