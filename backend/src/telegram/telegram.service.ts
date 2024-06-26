import { CACHE_TTL, CAUR_DEPLOY_LOG_ID, CAUR_NEWS_ID, TgMessage, TgMessageList } from "@./shared-lib"
import { Cache, CACHE_MANAGER } from "@nestjs/cache-manager"
import { Inject, Injectable, Logger } from "@nestjs/common"
import { getTdjson } from "prebuilt-tdlib"
import * as tdl from "tdl"

@Injectable()
export class TelegramService {
    protected readonly tgClient: any

    constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {
        tdl.configure({ tdjson: getTdjson() })

        const TELEGRAM_API_HASH = process.env.TELEGRAM_API_HASH || ""
        const TELEGRAM_API_ID = process.env.TELEGRAM_API_ID || ""
        const TELEGRAM_DB_ENCRYPTION_KEY = process.env.TELEGRAM_DB_ENCRYPTION_KEY || ""

        if (TELEGRAM_API_ID !== "" && TELEGRAM_API_HASH !== "" && TELEGRAM_DB_ENCRYPTION_KEY !== "") {
            this.tgClient = tdl.createClient({
                apiId: parseInt(TELEGRAM_API_ID),
                apiHash: TELEGRAM_API_HASH,
                databaseEncryptionKey: TELEGRAM_DB_ENCRYPTION_KEY,
                databaseDirectory: "./tdlib/db",
                filesDirectory: "./tdlib/files"
            })
            Logger.log("Telegram client started!", "TelegramService")
        } else {
            Logger.error("Telegram client not started! Please provide correct secrets in .env file.")
        }
    }

    /**
     * Get the latest news from the CAUR Telegram channel
     * @returns The parsed latest news from the CAUR Telegram channel
     */
    async getNews(): Promise<TgMessage[]> {
        // Cache the news for 60 seconds
        const cacheKey = "tgNews"
        let data: TgMessage[] | undefined = await this.cacheManager.get(cacheKey)
        if (!data) {
            data = await this.extractMessages(CAUR_NEWS_ID, 30)
            await this.cacheManager.set(cacheKey, data, CACHE_TTL)
        }
        return data
    }

    /**
     * Get the latest deployments from the CAUR Telegram channel
     * @returns The parsed latest deployments from the CAUR Telegram channel
     */
    async getDeployments(amount: any): Promise<TgMessage[]> {
        // Cache the news for 60 seconds
        const cacheKey = `tgDeployments-${amount}`
        let data: TgMessage[] | undefined = await this.cacheManager.get(cacheKey)
        if (!data) {
            data = await this.extractMessages(CAUR_DEPLOY_LOG_ID, parseInt(amount))
            await this.cacheManager.set(cacheKey, data, CACHE_TTL)
        }
        return data
    }

    /**
     * Authenticate the Telegram client, opens a prompt in the console window,
     * Certainly not optimal but functional
     */
    doAuth(): void {
        this.tgClient.login().then(() => {
            Logger.log("Logged in!", "TelegramService")
        })
    }

    /**
     * Logout the Telegram client
     */
    deAuth(): void {
        this.tgClient.logout.then(() => {
            Logger.log("Logged out!", "TelegramService")
        })
    }

    /**
     * Get the latest succeeded deployments from the CAUR Telegram channel
     * @param amount The amount of messages to retrieve
     */
    async getSucceeded(amount: any): Promise<TgMessageList> {
        return await this.getTgMessages("tgSucceededDeployments", amount, "📣")
    }

    /**
     * Get the latest failed deployments from the CAUR Telegram channel
     * @param amount The amount of messages to retrieve
     */
    async getFailed(amount: any): Promise<TgMessageList> {
        return await this.getTgMessages("tgFailedDeployments", amount, "🚫")
    }

    /**
     * Get the latest timed out builds from the CAUR Telegram channel
     * @param amount The number of messages to retrieve
     */
    async getTimedOut(amount: any): Promise<TgMessageList> {
        return await this.getTgMessages("tgTimedOutDeployments", amount, "⏳")
    }

    /**
     * Get the latest cleanup jobs from the CAUR Telegram channel
     * @param amount The number of messages to retrieve
     */
    async getCleanupJobs(amount: any): Promise<TgMessageList> {
        return await this.getTgMessages("tgCleanupJobs", amount, "✅")
    }

    /**
     * Extract messages from a Telegram message object
     * @param id The chat ID
     * @param desiredCount The desired count of messages
     * @param process Optional function to process the messages, eg. for filtering
     * @private
     */
    private async extractMessages(
        id: string,
        desiredCount: number,
        // eslint-disable-next-line @typescript-eslint/ban-types
        process?: Function
    ): Promise<TgMessage[]> {
        await this.getAllChats()
        let extractedMessages: TgMessage[] = []

        // Get the first message ID as a reference point, which is not the channel creation
        // message. This one was seemingly not valid as a reference point.
        const firstMessage = (await this.getChatHistory({ chat: id, offset: -2, from: 1 })).messages[0].id

        // Get the last message ID to start looping, while ensuring to push it into the array
        const lastMessage = (await this.getChatHistory({ chat: id, from: 0, limit: 1 })).messages[0]
        extractedMessages.push({
            date: lastMessage.date,
            content: lastMessage.content.text.text,
            author: lastMessage.author_signature,
            view_count: lastMessage.interaction_info.view_count,
            link: await this.getMessageLink(lastMessage.chat_id, lastMessage.id),
            id: lastMessage.id
        })
        let from = lastMessage.id

        while (extractedMessages.length < desiredCount) {
            const newMessages = await this.getChatHistory({ chat: id, from: from })
            for (const message of newMessages.messages) {
                if (
                    // Some messages seemingly don't have content, lets filter those out
                    Object.hasOwn(message, "content") &&
                    Object.hasOwn(message.content, "text")
                ) {
                    extractedMessages.push({
                        date: message.date,
                        content: message.content.text.text,
                        author: message.author_signature,
                        view_count: message.interaction_info.view_count,
                        link: await this.getMessageLink(message.chat_id, message.id),
                        id: message.id
                    })
                }
            }
            // The new from message ID is the last message ID from the previous batch
            from = extractedMessages[extractedMessages.length - 1].id

            // Break if the first message is found, no point in continuing. We need to
            // check this before filtering the messages though.
            let foundFirst = false
            if (extractedMessages.find((m) => m.id === firstMessage) !== undefined) {
                foundFirst = true
            }

            // Let's process the messages if a function is provided
            if (process) {
                extractedMessages = process(extractedMessages)
            }

            if (foundFirst) {
                break
            }
        }

        // Ensure we don't return more messages than desired, which can happen if
        // we receive messages up to the default limit of 50 (tdlib dynamically
        // seems to optimize the actually returned amount of messages)
        return extractedMessages.slice(0, desiredCount)
    }

    /**
     * Get all chats from the Telegram client, preparation for getting history
     * of a specific chat
     * @private
     */
    private async getAllChats(): Promise<any> {
        return await this.tgClient.invoke({
            _: "getChats",
            limit: 50
        })
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
            message_id: message
        })
        return linkObject.link
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
            offset: params.offset ? params.offset : undefined
        })
    }

    private async getTgMessages(cacheKeyId: string, amount: string, startsWith: string): Promise<TgMessageList> {
        const cacheKey = `${cacheKeyId}-${amount}`
        let data: TgMessage[] | undefined = await this.cacheManager.get(cacheKey)
        if (!data) {
            data = await this.extractMessages(CAUR_DEPLOY_LOG_ID, parseInt(amount), (messages: TgMessageList) => {
                const extractedMessages: TgMessageList = []
                for (const message of messages) {
                    if (!String(message.content).startsWith(startsWith)) {
                        continue
                    }
                    extractedMessages.push(message)
                }
                return extractedMessages
            })
            await this.cacheManager.set(cacheKey, data, CACHE_TTL)
        }
        return data
    }
}
