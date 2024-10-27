import { Logger } from "@nestjs/common";
import { Mutex } from "async-mutex";
import { Column, Entity, type FindManyOptions, PrimaryGeneratedColumn, type Repository } from "typeorm";
import { getPasswordHash } from "../functions";
import { UserRole, type User as UserType } from "../types";

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: "varchar" })
    name: string;

    @Column({ type: "varchar", nullable: true })
    password: string;

    @Column({ type: "varchar", nullable: true })
    mail: string;

    @Column({ type: "enum", enum: UserRole, default: UserRole.ROOT })
    status: UserRole;
}

// Mutexes to prevent double entries
const userMutex = new Mutex();

/**
 * Check if a package exists in the database, if not create a new entry
 * @param userObject The user object itself
 * @param connection The repository connection
 * @returns The package object itself
 */
export async function userExists(userObject: UserType, connection: Repository<User>): Promise<User> {
    return userMutex.runExclusive(async () => {
        try {
            let query: FindManyOptions<User>;
            if (!userObject.mail) {
                query = {
                    where: {
                        name: userObject.username,
                    },
                };
            } else {
                query = {
                    where: {
                        mail: userObject.mail,
                    },
                };
            }

            const users: User[] = await connection.find(query);
            let userExists: User = users.find((user) => {
                return userObject.username === user.name;
            });

            if (userExists === undefined && userObject.username !== undefined) {
                Logger.log(`User ${userObject.username} not found in database, creating new entry`, "UserEntity");
                userExists = await connection.save({
                    name: userObject.username,
                    password: await getPasswordHash(userObject.password),
                    mail: userObject.mail,
                    role: userObject.role,
                });
            } else {
                Logger.debug(`User ${userObject.username} found in database`, "UserEntity");
            }

            return userExists;
        } catch (err: unknown) {
            Logger.error(err, "UserEntity");
        }
    });
}
