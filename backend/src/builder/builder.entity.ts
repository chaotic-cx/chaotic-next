import { Logger } from "@nestjs/common";
import { Mutex } from "async-mutex";
import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, type Repository } from "typeorm";
import { BuildStatus } from "../types";

@Entity()
export class Builder {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: "varchar" })
    name: string;

    @Column({ type: "varchar", nullable: true })
    description: string;

    @Column({ type: "varchar", nullable: true })
    builderClass: string;

    @Column({ type: "boolean", nullable: true })
    isActive: boolean;
}

@Entity()
export class Package {
    @PrimaryGeneratedColumn()
    id: number;

    @Column("varchar")
    pkgname: string;

    @Column({ type: "timestamp", nullable: true })
    lastUpdated: string;

    @Column({ type: "boolean", nullable: false, default: true })
    isActive: boolean;
}

@Entity()
export class Repo {
    @PrimaryGeneratedColumn()
    id: number;

    @Column("varchar")
    name: string;

    @Column({ type: "varchar", nullable: true })
    repoUrl: string;
}

@Entity()
export class Build {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Package, (pkg) => pkg.id, { cascade: true })
    pkgbase: Package;

    @Column({ type: "varchar", nullable: true })
    buildClass: string;

    @ManyToOne(() => Builder, (builder) => builder.id, { cascade: true, nullable: true })
    builder: Builder;

    @ManyToOne(() => Repo, (repo) => repo.id, { cascade: true, nullable: true })
    repo: Repo;

    @Column({ type: "enum", enum: BuildStatus, default: BuildStatus.SUCCESS })
    status: BuildStatus;

    @CreateDateColumn()
    timestamp: Date;

    @Column({ type: "varchar", nullable: true })
    arch: string;

    @Column({ type: "varchar", nullable: true })
    logUrl: string;

    @Column({ type: "varchar", nullable: true })
    commit: string;

    @Column({ type: "float", nullable: true })
    timeToEnd: number;

    @Column({ type: "boolean", nullable: true })
    replaced: boolean;
}

// Mutexes to prevent double entries
const pkgnameMutex = new Mutex();
const builderMutex = new Mutex();
const repoMutex = new Mutex();

/**
 * Check if a package exists in the database, if not create a new entry
 * @param pkgname The name of the package
 * @param connection The repository connection
 * @returns The package object itself
 */
export async function pkgnameExists(pkgname: string, connection: Repository<Package>): Promise<Package> {
    return pkgnameMutex.runExclusive(async () => {
        try {
            const packages: Package[] = await connection.find({ where: { pkgname } });
            let packageExists: Package = packages.find((pkg) => {
                return pkgname === pkg.pkgname;
            });

            if (packageExists === undefined) {
                Logger.log(`Package ${pkgname} not found in database, creating new entry`, "BuilderEntity");
                packageExists = await connection.save({
                    pkgname: pkgname,
                    lastUpdated: new Date().toISOString(),
                    isActive: true,
                });
            } else {
                Logger.debug(`Package ${pkgname} found in database`, "BuilderEntity");
            }

            return packageExists;
        } catch (err: unknown) {
            Logger.error(err, "BuilderEntity");
        }
    });
}

/**
 * Check if a builder exists in the database, if not create a new entry
 * @param name The name of the builder
 * @param connection The repository connection
 * @returns The builder object itself
 */
export async function builderExists(name: string, connection: Repository<Builder>): Promise<Builder> {
    return builderMutex.runExclusive(async () => {
        try {
            const builders: Builder[] = await connection.find({ where: { name } });
            let builderExists: Builder = builders.find((builder) => {
                return name === builder.name;
            });

            if (builderExists === undefined) {
                Logger.log(`Builder ${name} not found in database, creating new entry`, "BuilderEntity");
                builderExists = await connection.save({
                    name: name,
                    isActive: false,
                    description: `Added on ${new Date().toISOString()}`,
                });
            }

            return builderExists;
        } catch (err: unknown) {
            Logger.error(err, "BuilderEntity");
        }
    });
}

/**
 * Check if a repo exists in the database, if not create a new entry
 * @param name The name of the repo
 * @param connection The repository connection
 * @returns The repo object itself
 */
export async function repoExists(name: string, connection: Repository<Repo>): Promise<Repo> {
    return repoMutex.runExclusive(async () => {
        try {
            const repos: Repo[] = await connection.find({ where: { name: name } });
            let repoExists: Repo = repos.find((repo) => {
                return name === repo.name;
            });

            if (repoExists === undefined) {
                Logger.log(`Repo ${name} not found in database, creating new entry`, "BuilderEntity");
                repoExists = await connection.save({
                    name: name,
                });
            }

            return repoExists;
        } catch (err: unknown) {
            Logger.error(err, "BuilderEntity");
        }
    });
}
