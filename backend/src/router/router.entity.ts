import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Package, Repo } from "../builder/builder.entity";

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

    @Column({ type: "varchar", nullable: true })
    hostname: string;

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
