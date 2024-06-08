import { Component } from "@angular/core"
import { Axios } from "axios"
import { CAUR_TG_API_URL, TgMessageList } from "../types"

@Component({
    selector: "app-news-channel",
    standalone: true,
    imports: [],
    templateUrl: "./news-channel.component.html",
    styleUrl: "./news-channel.component.css",
})
export class NewsChannelComponent {
    latestNews: any[] = []

    async ngAfterViewInit(): Promise<void> {
        this.latestNews = this.parseTgMessage(await this.getNews())
    }

    /**
     * Get the latest news from the Telegram channel.
     * @returns The latest news as a list of TgMessage.
     */
    async getNews(): Promise<TgMessageList> {
        const axios = new Axios({
            baseURL: CAUR_TG_API_URL,
            timeout: 1000,
        })

        return axios
            .get("telegram/news")
            .then((response) => {
                return JSON.parse(response.data)
            })
            .catch((err) => {
                console.error(err)
            })
    }

    /**
     * Parse the Telegram messages to make it usable for the website.
     * @param messages The TgMessageList array to parse.
     * @private
     */
    private parseTgMessage(messages: any[]): any[] {
        return messages.slice(0, 5)
    }
}
