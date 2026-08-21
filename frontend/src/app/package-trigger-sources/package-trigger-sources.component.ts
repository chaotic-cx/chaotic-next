import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { PackageRebuildTriggerSources } from '@chaotic-next/shared-lib';
import { ProgressSpinner } from '@openng/optimus-ui/progressspinner';
import { AppService } from '../app.service';
import { resourceValue } from '../functions';

@Component({
  selector: 'chaotic-package-trigger-sources',
  imports: [ProgressSpinner],
  template: `
    <div class="flex flex-col gap-3">
      @if (loading()) {
        <p-progress-spinner
          [style]="{ width: '24px', height: '24px' }"
          ariaLabel="Loading dependency sources"
          strokeWidth="4"
        />
      } @else if (!data()) {
        <span class="text-ctp-subtext text-xs">No dependency data for this package.</span>
      } @else {
        <div class="flex flex-col gap-2">
          <span class="text-ctp-text text-sm font-semibold">Soname dependencies</span>
          @if (data()!.sonameDependencies.length === 0) {
            <p class="text-ctp-subtext text-xs">No soname dependencies indexed.</p>
          } @else {
            <div class="flex flex-wrap justify-center gap-1.5">
              @for (dep of data()!.sonameDependencies; track dep.soname) {
                @for (provider of dep.providers; track provider.pkgname) {
                  <span
                    class="rounded-full border border-ctp-surface1 bg-ctp-surface0/40 px-3 py-1 text-xs text-ctp-text"
                  >
                    {{ dep.soname }} <span class="text-ctp-subtext0">({{ provider.pkgname }})</span>
                  </span>
                }
              }
            </div>
          }
        </div>
        @if (data()!.pluginOwners.length > 0) {
          <div class="flex flex-col gap-2">
            <span class="text-ctp-text text-sm font-semibold">Plugin of</span>
            <div class="flex flex-wrap justify-center gap-1.5">
              @for (owner of data()!.pluginOwners; track owner.pkgname) {
                <span
                  class="rounded-full border border-ctp-surface1 bg-ctp-surface0/40 px-3 py-1 text-xs text-ctp-text"
                >
                  {{ owner.pkgname }} <span class="text-ctp-subtext0">({{ owner.pkgType }})</span>
                </span>
              }
            </div>
          </div>
        }
        @if (data()!.explicitTriggers.length > 0) {
          <div class="flex flex-col gap-2">
            <span class="text-ctp-text text-sm font-semibold">Explicit triggers</span>
            <div class="flex flex-wrap justify-center gap-1.5">
              @for (trigger of data()!.explicitTriggers; track trigger.pkgname) {
                <span
                  class="rounded-full border border-ctp-surface1 bg-ctp-surface0/40 px-3 py-1 text-xs text-ctp-text"
                >
                  {{ trigger.pkgname }} <span class="text-ctp-subtext0">({{ trigger.archVersion }})</span>
                </span>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class PackageTriggerSourcesComponent {
  private readonly appService = inject(AppService);

  readonly pkgname = input<string>();

  private readonly resource = httpResource<PackageRebuildTriggerSources>(() => {
    const name = this.pkgname();
    return name ? this.appService.getPackageRebuildTriggerSourcesResourceRequest(name) : undefined;
  });

  readonly loading = this.resource.isLoading;

  readonly data = computed(() => resourceValue(this.resource) ?? null);
}
