import { RepoManagerService } from "./repo-manager.service";
import { Test, TestingModule } from "@nestjs/testing";

describe("RepoManagerService", () => {
    let service: RepoManagerService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [RepoManagerService],
        }).compile();

        service = module.get<RepoManagerService>(RepoManagerService);
    });

    it("should be defined", () => {
        expect(service).toBeDefined();
    });
});
