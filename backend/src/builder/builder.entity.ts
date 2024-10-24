import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { BuildStatus } from "../types";

@Entity()
export class Builder {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: "varchar", nullable: true })
    name: string;

    @Column({ type: "varchar", nullable: true })
    description: string;

    @Column({ type: "varchar", nullable: true })
    builderClass: string;

    @Column({ type: "boolean", nullable: true })
    isActive: boolean;
}

@Entity()
export class Repo {
    @PrimaryGeneratedColumn()
    id: number;

    @Column('varchar')
    name: string;

    @Column({type: "varchar", nullable: true})
    repoUrl: string;
}

@Entity()
export class Build {
    @PrimaryGeneratedColumn()
    id: number;

    @Column('varchar')
    pkgbase: string;

    @Column({type: "varchar", nullable: true})
    buildClass: string;

    @ManyToOne(() => Builder, (builder) => builder.id, { cascade: true, nullable: true })
    builder: Builder

    @ManyToOne(() => Repo, (repo) => repo.id, { cascade: true, nullable: true })
    repo: Repo

    @Column({type: 'enum', enum: BuildStatus, default: BuildStatus.SUCCESS})
    status: BuildStatus

    @CreateDateColumn()

    @Column({type: "varchar", nullable: true})
    arch: string;

    @Column({type: "varchar", nullable: true})
    logUrl: string;
    @Column({type: "varchar", nullable: true})
    commit: string;

    @Column({type: "float", nullable: true})
    timeToEnd: number;

    @Column({type: "boolean", nullable: true})
    replaced: boolean;
}
