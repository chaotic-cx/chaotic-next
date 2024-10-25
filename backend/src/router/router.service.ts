import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Mirror, mirrorExists, RouterHit } from "./router.entity";
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
        @InjectRepository(Mirror)
        private mirrorRepo: Repository<Mirror>,
    ) {
        Logger.log("RouterService initialized", "RouterService");
    }

    async hitRouter(body: RouterHitBody): Promise<void> {
        if (body.repo === undefined || body.package === undefined) {
            throw new BadRequestException("Missing required fields");
        }

        const pkg: Package = await pkgnameExists(body.package, this.packageRepo);
        const repo: Repo = await repoExists(body.repo, this.repoRepo);
        const mirror: Mirror = await mirrorExists(body.hostname, this.mirrorRepo);

        const toSave: Partial<RouterHit> = {
            country: body.country,
            hostname: mirror,
            ip: body.ip,
            pkgbase: pkg,
            repo: repo,
            repo_arch: body.repo_arch,
            timestamp: new Date(body.timestamp).toISOString(),
            user_agent: body.user_agent,
            version: `${body.version}-${body.pkgrel}`,
        };

        void this.routerRitRepo.save(toSave);
    }
}
