import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Card } from '@openng/optimus-ui/card';
import { AppService } from '../app.service';

@Component({
  selector: 'chaotic-footer',
  imports: [Card, RouterLink],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css',
})
export class FooterComponent {
  private readonly appService = inject(AppService);
  currentYear = new Date().getFullYear();
  protected readonly version = this.appService.backendVersion;
}
