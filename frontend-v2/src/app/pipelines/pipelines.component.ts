import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppService } from '../app.service';
import { JobSchema, PipelineSchema } from '@gitbeaker/rest';
import { Fieldset } from 'primeng/fieldset';
import { TableModule } from 'primeng/table';

@Component({
  selector: 'chaotic-pipelines',
  imports: [CommonModule, Fieldset, TableModule],
  templateUrl: './pipelines.component.html',
  styleUrl: './pipelines.component.css',
})
export class PipelinesComponent implements OnInit {
  pipelines: {
    jobs: JobSchema[];
    pipeline: PipelineSchema;
  }[] = [];
  loading = true;

  page = signal<number>(1);

  private readonly appService = inject(AppService);

  ngOnInit() {
    this.appService.getStatusChecks(this.page()).subscribe({
      next: (pipelines) => {
        console.log(pipelines);
      },
      error: (err) => {
        console.error(err);
      },
      complete: () => {
        this.loading = false;
      },
    });
  }
}
