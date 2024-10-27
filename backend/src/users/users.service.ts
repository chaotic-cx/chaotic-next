import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { User as UserType, Users } from "../types";
import { User, userExists } from "./users.entity";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";

@Injectable()
export class UsersService {
    users: Users = [];

    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        private configService: ConfigService,
    ) {
        const usersConfig = this.configService.get<string>("CAUR_USERS");
        try {
            if (usersConfig) {
                this.users = JSON.parse(usersConfig);
                Logger.log("Users sourced from environment", "UsersService");
            } else {
                Logger.log("No users found in configuration, using values from database, if present", "UsersService");
            }
        } catch (err: unknown) {
            Logger.error(err, "UsersService");
        }

        void this.init();
    }

    async init(): Promise<void> {
        for (const user of this.users) {
            await userExists(user, this.userRepository);
        }
        Logger.log("UsersService initialized", "UsersService");
    }

    /**
     * Check if a user exists in the database.
     * @param auth
     * @param checkFor
     */
    async checkIfUserExists(auth: string, checkFor: "mail" | "username"): Promise<User | null> {
        Logger.debug(`Checking if user ${auth} exists`, "UsersService");
        switch (checkFor) {
            case "username":
                return this.userRepository.findOne({ where: { name: auth } });
            case "mail":
                return this.userRepository.findOne({ where: { mail: auth } });
        }
    }

    /**
     * Create a new user in the database.
     * @param user The user object to create
     * @returns The new user object
     */
    async createUser(user: UserType): Promise<User> {
        return userExists(user, this.userRepository);
    }
}
