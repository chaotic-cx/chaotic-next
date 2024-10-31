import { Column, Entity, PrimaryGeneratedColumn, Repository } from "typeorm";
import { RepoStatus } from "../interfaces/repo-manager";
import { Mutex } from "async-mutex";
import { Logger } from "@nestjs/common";

@Entity()
export class RepoManRepo {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: "varchar" })
    name: string;

    @Column({ type: "varchar" })
    url: string;

    @Column({ type: "int" })
    status: RepoStatus;

    @Column({ type: "varchar", nullable: true })
    gitRef: string;
}

@Entity()
export class ArchlinuxPackage {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: "varchar" })
    pkgname: string;

    @Column({ type: "varchar", nullable: true })
    version: string;

    @Column({ type: "varchar", nullable: true })
    arch: string;

    @Column({ type: "timestamp", nullable: true })
    lastUpdated: string;

    @Column({ type: "varchar", nullable: true })
    previousVersion: string;
}

@Entity()
export class RepoManagerSettings {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: "varchar" })
    key: string;

    @Column({ type: "varchar" })
    value: string;
}

const packageMutex = new Mutex();

/**
 * Check if a package exists in the database, if not create a new entry
 * @param pkg The package object
 * @param connection The repository connection
 * @returns The package object itself
 */
export async function archPkgExists(
    pkg: {
        version: string;
        name: string;
    },
    connection: Repository<ArchlinuxPackage>,
): Promise<ArchlinuxPackage> {
    return packageMutex.runExclusive(async () => {
        try {
            const packages: ArchlinuxPackage[] = await connection.find({ where: { pkgname: pkg.name } });
            let packageExists: Partial<ArchlinuxPackage> = packages.find((onePkg) => {
                return onePkg.pkgname === pkg.name;
            });

            if (packageExists === undefined) {
                Logger.log(`Package ${pkg.name} not found in database, creating new entry`, "RepoManagerEntity");
                packageExists = await connection.save({
                    pkgname: pkg.name,
                    version: pkg.version,
                });
            }

            return packageExists as ArchlinuxPackage;
        } catch (err: unknown) {
            Logger.error(err, "RepoManagerEntity");
        }
    });
}
