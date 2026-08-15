import { Directive, ElementRef, inject, OnInit } from '@angular/core';

@Directive({
  selector: '[chaoticUnsetRounding], p-table',
})
export class DatatableUnsetRoundingDirective implements OnInit {
  private readonly el = inject(ElementRef);

  ngOnInit(): void {
    const native: HTMLElement = this.el.nativeElement;
    const containers = native.querySelectorAll('.p-datatable-table-container');
    if (containers.length > 0) {
      for (const container of containers) {
        if (container instanceof HTMLElement) {
          container.style.borderRadius = '0';
        }
      }
    } else {
      native.style.borderRadius = '0';
    }
  }
}
