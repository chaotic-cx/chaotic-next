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

    /**
     * Save a router request to the database.
     * @param body The request body containing at least repo and package properties
     */
    async hitRouter(body: RouterHitBody): Promise<void> {
        if ((body.repo || body.package) === undefined) {
            throw new BadRequestException("Missing required fields");
        }

        const relations: [Package, Repo, Mirror] = await Promise.all([
            await pkgnameExists(body.package, this.packageRepo),
            await repoExists(body.repo, this.repoRepo),
            await mirrorExists(body.hostname, this.mirrorRepo),
        ]);

        const toSave: Partial<RouterHit> = {
            country: body.country,
            hostname: relations[2],
            ip: body.ip,
            pkgbase: relations[0],
            repo: relations[1],
            repo_arch: body.repo_arch,
            timestamp: new Date(Number(body.timestamp) * 1000).toISOString(),
            user_agent: body.user_agent,
            version: `${body.version}-${body.pkgrel}`,
        };

        void this.routerRitRepo.save(toSave);
    }
}
