import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppService } from '../app.service';
import { Fieldset } from 'primeng/fieldset';
import { TableModule } from 'primeng/table';
import { PipelineWithExternalStatus } from '@./shared-lib';

@Component({
  selector: 'chaotic-pipelines',
  imports: [CommonModule, Fieldset, TableModule],
  templateUrl: './pipelines.component.html',
  styleUrl: './pipelines.component.css',
})
export class PipelinesComponent implements OnInit {
  pipelines!: PipelineWithExternalStatus[];
  loading = true;
  page = signal<number>(1);

  private readonly appService = inject(AppService);

  ngOnInit() {}
}
