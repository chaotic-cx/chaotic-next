import {
    CACHE_TELEGRAM_TTL,
    CAUR_DEPLOY_LOG_ID,
    CAUR_NEWS_ID,
    RepositoryList,
    type TgMessage,
    type TgMessageList,
} from "@./shared-lib";
import { type Cache, CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { getTdjson } from "prebuilt-tdlib";
import { type Client, configure, createClient } from "tdl";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class TelegramService {
    protected readonly tgClient: Client;

    constructor(
        @Inject(CACHE_MANAGER) private cacheManager: Cache,
        private configService: ConfigService,
    ) {
        configure({ tdjson: getTdjson() });

        const TELEGRAM_API_HASH = this.configService.get<string>("TELEGRAM_API_HASH") || "";
        const TELEGRAM_API_ID = this.configService.get<string>("TELEGRAM_API_ID") || "";
        const TELEGRAM_DB_ENCRYPTION_KEY = this.configService.get<string>("TELEGRAM_DB_ENCRYPTION_KEY") || "";

        if ((TELEGRAM_API_ID && TELEGRAM_API_HASH && TELEGRAM_DB_ENCRYPTION_KEY) !== "") {
            this.tgClient = createClient({
                apiId: Number.parseInt(TELEGRAM_API_ID),
                apiHash: TELEGRAM_API_HASH,
                databaseEncryptionKey: TELEGRAM_DB_ENCRYPTION_KEY,
                databaseDirectory: "./tdlib/db",
                filesDirectory: "./tdlib/files",
            });
            Logger.log("Telegram client started", "TelegramService");
        } else {
            Logger.error("Telegram client not started! Please provide correct secrets in .env file.");
        }
    }

    /**
     * Get the latest news from the CAUR Telegram channel
     * @returns The parsed latest news from the CAUR Telegram channel
     */
    async getNews(): Promise<TgMessage[]> {
        Logger.debug("getNews requested", "TelegramService");

        // Cache the news for 60 seconds
        const cacheKey = "tgNews";
        let data: TgMessage[] | undefined = await this.cacheManager.get(cacheKey);
        if (!data) {
            data = await this.extractMessages(CAUR_NEWS_ID, 30);
            await this.cacheManager.set(cacheKey, data, CACHE_TELEGRAM_TTL);
        }
        return data;
    }

    /**
     * Get the latest deployments from the CAUR Telegram channel
     * @param amount The number of messages to retrieve
     * @param repo The repository to filter for
     * @returns The parsed latest deployments from the CAUR Telegram channel
     */
    async getDeployments(amount: number, repo: RepositoryList): Promise<TgMessage[]> {
        Logger.debug("getDeployments requested", "TelegramService");

        let actualFetch: number;

        if (amount > 2000) {
            Logger.warn("Invalid amount requested", "TelegramService");
            actualFetch = 2000;
        } else {
            actualFetch = amount;
        }

        // Cache the news for 60 seconds
        const cacheKey = `tgDeployments-${repo}-${actualFetch}`;
        let data: TgMessage[] | undefined = await this.cacheManager.get(cacheKey);
        if (!data) {
            data = await this.extractMessages(CAUR_DEPLOY_LOG_ID, actualFetch, undefined, repo);
            await this.cacheManager.set(cacheKey, data, CACHE_TELEGRAM_TTL);
        }
        return data;
    }

    /**
     * Authenticate the Telegram client, opens a prompt in the console window,
     * Certainly not optimal but functional
     */
    async doAuth(): Promise<void> {
        await this.tgClient.login();
        Logger.log("Logged in!", "TelegramService");
    }

    /**
     * Logout the Telegram client
     */
    async deAuth(): Promise<void> {
        await this.tgClient.close();
        Logger.log("Logged out!", "TelegramService");
    }

    /**
     * Get the latest succeeded deployments from the CAUR Telegram channel
     * @param amount The number of messages to retrieve
     * @param repo The repository to filter for
     */
    async getSucceeded(amount: number, repo: RepositoryList): Promise<TgMessageList> {
        Logger.debug("getSucceeded requested", "TelegramService");
        return this.getTgMessages("tgSucceededDeployments", amount, "📣", repo);
    }

    /**
     * Get the latest failed deployments from the CAUR Telegram channel
     * @param amount The number of messages to retrieve
     * @param repo The repository to filter for
     */
    async getFailed(amount: number, repo: RepositoryList): Promise<TgMessageList> {
        Logger.debug("getFailed requested", "TelegramService");
        return this.getTgMessages("tgFailedDeployments", amount, "🚨", repo);
    }

    /**
     * Get the latest timed out builds from the CAUR Telegram channel
     * @param amount The number of messages to retrieve
     * @param repo The repository to filter for
     */
    async getTimedOut(amount: number, repo: RepositoryList): Promise<TgMessageList> {
        Logger.debug("getTimedOut requested", "TelegramService");
        return this.getTgMessages("getTimedOut", amount, "⏳", repo);
    }

    /**
     * Get the latest cleanup jobs from the CAUR Telegram channel
     * @param amount The number of messages to retrieve
     * @param repo The repository to filter for
     */
    async getCleanupJobs(amount: number, repo: RepositoryList): Promise<TgMessageList> {
        Logger.debug("getCleanupJobs requested", "TelegramService");
        return this.getTgMessages("tgCleanupJobs", amount, "✅", repo);
    }

    /**
     * Extract messages from a Telegram message object
     * @param id The chat ID
     * @param desiredCount The desired count of messages
     * @param process Optional function to process the messages, e.g., for filtering
     * @param repo The repository to filter for
     * @returns The extracted messages
     * @private
     */
    private async extractMessages(
        id: string,
        desiredCount: number,
        process?: (messages: TgMessageList) => TgMessageList,
        repo?: RepositoryList,
    ): Promise<TgMessageList> {
        await this.getAllChats();
        let extractedMessages: TgMessageList = [];

        // Get the first message ID as a reference point, which is not the channel creation
        // message. This one was seemingly not valid as a reference point.
        const firstMessage = (await this.getChatHistory({ chat: id, offset: -2, from: 1 })).messages[0].id;

        // Get the last message ID to start looping while ensuring to push it into the array
        const lastMessage = (await this.getChatHistory({ chat: id, from: 0, limit: 1 })).messages[0];

        extractedMessages.push({
            date: lastMessage.date,
            content: lastMessage.content.text.text,
            author: lastMessage.author_signature,
            view_count: lastMessage.interaction_info.view_count,
            link: await this.getMessageLink(lastMessage.chat_id, lastMessage.id),
            id: lastMessage.id,
        });

        let from = lastMessage.id;
        let foundFirst = false;

        while (extractedMessages.length < desiredCount) {
            const newMessages = await this.getChatHistory({
                chat: id,
                from: from,
            });

            for (const message of newMessages.messages) {
                if (
                    // Some messages seemingly don't have content, let's filter those out
                    Object.hasOwn(message, "content") &&
                    Object.hasOwn(message.content, "text")
                ) {
                    extractedMessages.push({
                        date: message.date,
                        content: message.content.text.text,
                        author: message.author_signature,
                        view_count: message.interaction_info.view_count,
                        link: await this.getMessageLink(message.chat_id, message.id),
                        id: message.id,
                        log: this.getLogLink(message.content.text),
                    });
                }
            }

            // The new from message ID is the last message ID from the previous batch
            from = extractedMessages[extractedMessages.length - 1].id;

            // Break if the first message is found, no point in continuing. We need to
            // check this before filtering the messages, though.
            // The check for "Ohayo" is a check for one of the last messages of infra 3.0,
            // comparing date didn't work as expected.
            if (
                extractedMessages[extractedMessages.length - 1].id === firstMessage ||
                extractedMessages.find((message) => message.content.toString().includes("Ohayo"))
            ) {
                foundFirst = true;
            }

            // Let's process the messages if a function is provided
            if (process) {
                extractedMessages = process(extractedMessages);
            }
            if (repo && repo !== "all") {
                const regexTerm = `\\b${repo}\\b`;
                const regex = new RegExp(regexTerm);
                extractedMessages = extractedMessages.filter((message) => {
                    return message.content.toString().match(regex) !== null;
                });

                // Weed out any pre infra 3.0 messages
                extractedMessages = extractedMessages.filter((message) => {
                    const regex = new RegExp(/[📣✅🚨⏳]/, "u");
                    return message.content.toString().match(regex) !== null;
                });
            }

            if (foundFirst) {
                break;
            }
        }

        // Ensure we don't return more messages than desired, which can happen if
        // we receive messages up to the default limit of 50 (tdlib dynamically
        // seems to optimize the actually returned number of messages)
        return extractedMessages.slice(0, desiredCount);
    }

    /**
     * Get all chats from the Telegram client, preparation for getting history
     * of a specific chat
     * @private
     */
    private async getAllChats(): Promise<void> {
        Logger.debug("Getting all chats", "TelegramService");
        return this.tgClient.invoke({
            _: "getChats",
            limit: 50,
        });
    }

    /**
     * Get a message link for a specific message
     * @param chat The chat ID
     * @param message The message ID
     * @returns The message link as string
     * @private
     */
    private async getMessageLink(chat: number, message: number): Promise<string> {
        const linkObject = await this.tgClient.invoke({
            _: "getMessageLink",
            chat_id: chat,
            message_id: message,
        });
        return linkObject.link;
    }

    /**
     * Extract links to logfiles from a specific chat
     * @param messageText The Telegram message object to parse
     * @returns The log link as string or undefined
     * @private
     */
    private getLogLink(messageText: any): string | undefined {
        // The first one is usually bold, the second one is the link we need
        // Likely very infancy code used to prevent an undefined crash.
        if (messageText?.entities[1]?.type?.url?.includes("https")) {
            return messageText.entities[1].type.url;
        }
        return undefined;
    }

    /**
     * Get the chat history of a specific chat
     * @param params The chat ID, with from message ID and offset as optional parameters
     * @returns The chat history
     * @private
     */
    private async getChatHistory(params: { chat: string; from?: number; limit?: number; offset?: number }) {
        return this.tgClient.invoke({
            _: "getChatHistory",
            chat_id: params.chat,
            from_message_id: params.from ? params.from : undefined,
            limit: params.limit ? params.limit : 50,
            offset: params.offset ? params.offset : undefined,
        });
    }

    /**
     * Get the latest messages from the CAUR Telegram channel
     * @param cacheKeyId The cache key ID getting checked before executing the request
     * @param amount The number of messages to retrieve
     * @param startsWith The string to filter the messages by
     * @param repo The repository to filter for
     * @returns The parsed latest messages from the CAUR Telegram channels
     * @private
     */
    private async getTgMessages(
        cacheKeyId: string,
        amount: number,
        startsWith: string,
        repo: RepositoryList,
    ): Promise<TgMessageList> {
        Logger.debug(
            `getTgMessages requested for ${cacheKeyId}-${repo}, trying to serve from cache`,
            "TelegramService",
        );

        let actualFetch: number;

        if (amount > 2000) {
            Logger.warn("Invalid amount requested", "TelegramService");
            actualFetch = 2000;
        } else {
            actualFetch = amount;
        }

        const cacheKey = `${cacheKeyId}-${actualFetch}-${repo}`;
        let data: TgMessage[] | undefined = await this.cacheManager.get(cacheKey);

        if (!data) {
            Logger.debug(`Fetching ${cacheKeyId} messages, no cache available`, "TelegramService");
            data = await this.extractMessages(
                CAUR_DEPLOY_LOG_ID,
                actualFetch,
                (messages: TgMessageList) => {
                    return messages.filter((message) => {
                        return message.content.toString().startsWith(startsWith);
                    });
                },
                repo,
            );
            await this.cacheManager.set(cacheKey, data, CACHE_TELEGRAM_TTL);
        }
        return data;
    }
}
