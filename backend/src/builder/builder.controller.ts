import { Controller, Get } from "@nestjs/common";
import { BuilderService } from "./builder.service";
import { Builder } from "./builder.entity";

@Controller("builder")
export class BuilderController {
    constructor(private builderService: BuilderService) {}

    @Get()
    getBuilder() {
        return "Builder";
    }

    @Get("test")
    test() {
        const builder = {
            builderClass: "1",
            name: "test name",
            description: "test desc",
            builds: [],
            isActive: false,
        };
        // @ts-ignore
        return this.builderService.addBuilder(builder);
    }
}
