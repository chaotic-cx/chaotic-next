import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { BuildStatus } from "../constants";

@Entity()
export class Builder {
    @PrimaryGeneratedColumn()
    id: number;

    @Column("varchar")
    name: string;

    @Column("varchar")
    description: string;

    @Column("char")
    builderClass: string;

    @Column("boolean")
    isActive: boolean;

    @OneToMany(() => Build, (build) => build.builder)
    builds: Build[];
}

@Entity()
export class Build {
    @PrimaryGeneratedColumn()
    id: number;

    @Column('varchar')
    pkgbase: string;

    @Column('char')
    buildClass: string;

    @Column('char')
    builderClass: string;

    @ManyToOne(() => Builder, (builder) => builder.builds, { cascade: true })
    builder: Builder

    @Column('int')
    repo: number;

    @Column({type: 'enum', enum: BuildStatus, default: BuildStatus.SUCCESS})
    status: BuildStatus

    @CreateDateColumn()

    @Column('char')
    arch: string;

    @Column('varchar')
    logUrl: string;

    @Column('char')
    commit: string;

    @Column('int')
    timeToEnd: number;
}

@Entity()
export class Repo {
    @PrimaryGeneratedColumn()
    id: number;

    @Column('varchar')
    name: string;

    @Column('varchar')
    repoUrl: string;
}
