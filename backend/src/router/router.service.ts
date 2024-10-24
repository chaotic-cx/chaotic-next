import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { RouterHit } from "./router.entity";
import type { Repository } from "typeorm";
import type { RouterHitBody } from "../types";
import { Package, pkgnameExists, Repo, repoExists } from "../builder/builder.entity";

@Injectable()
export class RouterService {
    constructor(
        @InjectRepository(RouterHit)
        private routerRitRepo: Repository<RouterHit>,
        @InjectRepository(Package)
        private packageRepo: Repository<Package>,
        @InjectRepository(Repo)
        private repoRepo: Repository<Repo>,
    ) {
        Logger.log("RouterService initialized", "RouterService");
    }

    async hitRouter(body: RouterHitBody) {
        if (body.repo === undefined || body.pkgbase === undefined) {
            return "Invalid request";
        }

        const pkg = await pkgnameExists(body.pkgbase, this.packageRepo);
        const repo = await repoExists(body.repo, this.repoRepo);

        const toSave: Partial<RouterHit> = {
            ...body,
            pkgbase: pkg,
            repo: repo,
        };

        return this.routerRitRepo.save(toSave);
    }
}
