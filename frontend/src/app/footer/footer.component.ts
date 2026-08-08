import { Component } from '@angular/core';
import { Card } from '@openng/optimus-ui/card';

@Component({
  selector: 'chaotic-footer',
  imports: [Card],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css',
})
export class FooterComponent {
  currentYear = new Date().getFullYear();
}
