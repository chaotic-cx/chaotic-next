import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { RouterHit } from "./router.entity";
import type { Repository } from "typeorm";

@Injectable()
export class RouterService {
    constructor(
        @InjectRepository(RouterHit)
        routerRitRepo: Repository<RouterHit>,
    ) {}
}
