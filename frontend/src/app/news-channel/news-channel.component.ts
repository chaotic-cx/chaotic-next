import { CAUR_TG_API_URL, checkIfMobile, type TgMessageList } from "@./shared-lib"
import { type AfterViewInit, Component } from "@angular/core"
import { Axios } from "axios"
import { DatePipe } from "@angular/common"

@Component({
    selector: "app-news-channel",
    standalone: true,
    imports: [
        DatePipe
    ],
    templateUrl: "./news-channel.component.html",
    styleUrl: "./news-channel.component.css",
})
export class NewsChannelComponent implements AfterViewInit {
    latestNews: any[] = []
    isMobile = false

    async ngAfterViewInit(): Promise<void> {
        this.latestNews = this.parseTgMessage(await this.getNews())
        this.isMobile = checkIfMobile()
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
            .get("news")
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
        for (const message of messages) {
            message.date = new Date(message.date * 1000).toDateString()
        }
        if (this.isMobile) {
            return messages.slice(0, 3)
        } else {
            return messages.slice(0, 5)
        }
    }
}
