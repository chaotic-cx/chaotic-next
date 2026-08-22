import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MultiSelectModule } from '@openng/optimus-ui/multiselect';
import { ColumnVisibilityService } from './column-visibility.service';

export interface ColumnDef {
  key: string;
  label: string;
  defaultVisible?: boolean;
}

@Component({
  selector: 'chaotic-column-toggle',
  imports: [MultiSelectModule, FormsModule],
  template: `
    <div class="hidden sm:block">
      <p-multi-select
        class="sm:w-40"
        [(ngModel)]="selected"
        [options]="columns()"
        [maxSelectedLabels]="0"
        [showHeader]="false"
        [tooltip]="'Choose visible columns'"
        (onChange)="persist()"
        optionLabel="label"
        optionValue="key"
        selectedItemsLabel="{0} columns"
        placeholder="Columns"
        appendTo="body"
      />
    </div>
  `,
})
export class ColumnVisibilityComponent {
  protected readonly visibility = inject(ColumnVisibilityService);

  readonly tableKey = input.required<string>();
  readonly columns = input.required<ColumnDef[]>();

  protected readonly selected = signal<string[]>([]);

  constructor() {
    effect(() => {
      this.visibility.register(
        this.tableKey(),
        this.columns().map((column) => column.key),
      );
      this.selected.set([...this.visibility.visible(this.tableKey())()]);
    });
  }

  protected persist(): void {
    this.visibility.replace(this.tableKey(), this.selected());
  }
}
