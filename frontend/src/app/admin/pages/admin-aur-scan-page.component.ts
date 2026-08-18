import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from '@openng/optimus-ui/button';
import { InputText } from '@openng/optimus-ui/inputtext';
import { Panel } from '@openng/optimus-ui/panel';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AurScanResultComponent } from '../../aur-scan/aur-scan-result.component';
import { AurScanService } from '../../aur-scan/aur-scan.service';

@Component({
  selector: 'chaotic-admin-aur-scan-page',
  imports: [FormsModule, AurScanResultComponent, Button, InputText, Panel, Tooltip],
  template: `
    <p-panel header="Scan AUR package">
      <div class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center gap-3">
          <input
            class="w-full sm:w-72"
            [(ngModel)]="packageName"
            (keyup.enter)="scan()"
            pInputText
            type="text"
            placeholder="AUR package name, e.g. firefox"
          />
          <p-button
            [label]="scanning() ? 'Scanning…' : 'Scan package'"
            [loading]="scanning()"
            [disabled]="!packageName().trim()"
            (onClick)="scan()"
            icon="pi pi-search"
            severity="secondary"
            pTooltip="Fetches the AUR PKGBUILD and its sources, runs the security rules and checks URLs on VirusTotal"
            tooltipPosition="bottom"
          />
        </div>

        @if (scannedPackage()) {
          <chaotic-aur-scan-result [packageName]="scannedPackage()" />
        }
      </div>
    </p-panel>
  `,
})
export class AdminAurScanPageComponent {
  private readonly aurScanService = inject(AurScanService);

  readonly packageName = signal('');
  readonly scannedPackage = signal('');
  readonly scanning = signal(false);

  protected async scan(): Promise<void> {
    const name = this.packageName().trim();
    if (!name) return;
    this.scannedPackage.set(name);
    this.scanning.set(true);
    await this.aurScanService.startScan(name);
    this.scanning.set(false);
  }
}
