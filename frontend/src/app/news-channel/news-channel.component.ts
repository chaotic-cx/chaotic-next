import { type TgMessageList } from "@./shared-lib"
import { DatePipe } from "@angular/common"
import { type AfterViewInit, Component } from "@angular/core"
import { lastValueFrom } from "rxjs"
import { AppService } from "../app.service"
import { checkIfMobile } from "../functions"

@Component({
    selector: "app-news-channel",
    standalone: true,
    imports: [DatePipe],
    templateUrl: "./news-channel.component.html",
    styleUrl: "./news-channel.component.css",
})
export class NewsChannelComponent implements AfterViewInit {
    latestNews: TgMessageList = []
    isMobile = false

    constructor(private appService: AppService) {}

    async ngAfterViewInit(): Promise<void> {
        this.latestNews = this.parseTgMessage(await this.getNews())
        this.isMobile = checkIfMobile()
    }

    /**
     * Get the latest news from the Telegram channel.
     * @returns The latest news as a list of TgMessage.
     */
    async getNews(): Promise<TgMessageList> {
        return lastValueFrom(this.appService.getNews())
    }

    /**
     * Parse the Telegram messages to make it usable for the website.
     * @param messages The TgMessageList array to parse.
     * @private
     */
    private parseTgMessage(messages: TgMessageList): TgMessageList {
        for (const message of messages) {
            message.date = new Date(Number(message.date) * 1000).toDateString()
        }
        if (this.isMobile) {
            return messages.slice(0, 3)
        }
        return messages.slice(0, 5)
    }
}
