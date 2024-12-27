import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppService } from '../app.service';
import { lastValueFrom } from 'rxjs';
import { TgMessageList } from '@./shared-lib';
import { TableModule } from 'primeng/table';
import { Fieldset } from 'primeng/fieldset';
import { TruncatePipe } from '../pipes/truncate.pipe';
import { ScrollPanel } from 'primeng/scrollpanel';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'chaotic-newsfeed',
  imports: [CommonModule, TableModule, Fieldset, TruncatePipe, ScrollPanel],
  templateUrl: './newsfeed.component.html',
  styleUrl: './newsfeed.component.css',
  providers: [MessageService],
})
export class NewsfeedComponent implements OnInit {
  newsList: TgMessageList = [];

  constructor(private appService: AppService) {}

  async ngOnInit(): Promise<void> {
    try {
      this.newsList = await lastValueFrom(this.appService.getNews());
      console.log(this.newsList);
    } catch (err: unknown) {
      console.error(err);
    }
  }

  protected readonly Number = Number;
}
