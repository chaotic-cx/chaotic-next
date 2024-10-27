import { Logger } from "@nestjs/common";
import { Mutex } from "async-mutex";
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, type Repository } from "typeorm";
import { Package, Repo } from "../builder/builder.entity";

@Entity()
export class Mirror {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: "varchar" })
    hostname: string;
}

@Entity()
export class RouterHit {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Package, (pkg) => pkg.id, { cascade: true })
    pkgbase: Package;

    @Column({ type: "timestamp", nullable: true })
    timestamp: string;

    @Column({ type: "varchar", nullable: true })
    ip: string;

    @ManyToOne(() => Mirror, (mirror) => mirror.id, { cascade: true, nullable: true })
    hostname: Mirror;

    @ManyToOne(() => Repo, (repo) => repo.id, { cascade: true, nullable: true })
    repo: Repo;

    @Column({ type: "varchar", nullable: true })
    repo_arch: string;

    @Column({ type: "varchar", nullable: true })
    version: string;

    @Column({ type: "varchar", nullable: true })
    country: string;

    @Column({ type: "varchar", nullable: true })
    user_agent: string;
}

const mirrorMutex = new Mutex();

/**
 * Check if a mirror exists in the database, if not create a new entry
 * @param name The name of the builder
 * @param connection The repository connection
 * @returns The mirror object itself
 */
export async function mirrorExists(name: string, connection: Repository<Mirror>): Promise<Mirror> {
    return mirrorMutex.runExclusive(async () => {
        try {
            const mirrors: Mirror[] = await connection.find({ where: { hostname: name } });
            let mirrorExists: Mirror = mirrors.find((mirror) => { return name === mirror.hostname });

            if (mirrorExists === undefined) {
                Logger.log(`Mirror ${name} not found in database, creating new entry`, "RouterEntity");
                mirrorExists = await connection.save({
                    hostname: name,
                });
            }

            return mirrorExists;
        } catch(err: unknown) {
            Logger.error(err, "RouterEntity");
        }
    });
}

export type RouterHitColumns = Omit<keyof RouterHit, "id">;
export type MirrorColumns = Omit<keyof Mirror, "id">;

export function isOfTypeRouterHitColumns(value: unknown): value is RouterHitColumns {
    return Object.keys(RouterHit).includes(String(value));
}
