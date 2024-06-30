import { Test, TestingModule } from "@nestjs/testing"
import { Misc } from "./misc"

describe("Misc", () => {
    let provider: Misc

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [Misc],
        }).compile()

        provider = module.get<Misc>(Misc)
    })

    it("should be defined", () => {
        expect(provider).toBeDefined()
    })
})
