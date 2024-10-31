import { RepoManagerModule } from "./repo-manager.module";

describe("RepoManager", () => {
    it("should be defined", () => {
        expect(new RepoManagerModule()).toBeDefined();
    });
});
