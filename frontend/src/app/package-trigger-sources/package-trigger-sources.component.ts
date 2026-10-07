import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { PackageRebuildTriggerSources, RebuildTriggerSourcePackage } from '@chaotic-next/shared-lib';
import { TranslocoDirective } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { AppService } from '../app.service';
import { resourceFailed, resourceValue } from '../functions';
import { LoadErrorComponent } from '../load-error/load-error.component';

const SKELETON_CHIPS = [0, 1, 2];

const PKG_TYPE_KEYS: Record<RebuildTriggerSourcePackage['pkgType'], string> = {
  arch: marker('triggerSources.pkgType.arch'),
  chaotic: marker('triggerSources.pkgType.chaotic'),
};

@Component({
  selector: 'chaotic-package-trigger-sources',
  imports: [LoadErrorComponent, TranslocoDirective],
  template: `
    <div class="flex flex-col gap-6" *transloco="let t; prefix: 'triggerSources'">
      @if (failed()) {
        <chaotic-load-error [message]="t('loadError')" [error]="error()" (retry)="reload()" />
      } @else if (loading()) {
        <div class="skeleton-reveal pkg-group__list" [attr.aria-label]="t('loadingAriaLabel')" role="status">
          @for (chip of skeletonChips; track chip) {
            <span class="chaotic-skeleton block h-7 w-40" aria-hidden="true"></span>
          }
        </div>
      } @else if (data(); as sources) {
        <section class="pkg-group" [attr.aria-label]="t('sonameDependencies')">
          <h3 class="pkg-group__label">
            {{ t('sonameDependencies') }}
            <span class="pkg-group__count">{{ sonameProviderCount() }}</span>
          </h3>
          @if (sources.sonameDependencies.length === 0) {
            <p class="pkg-group__empty">{{ t('noSonameDependencies') }}</p>
          } @else {
            <ul class="pkg-group__list">
              @for (dep of sources.sonameDependencies; track dep.soname) {
                @for (provider of dep.providers; track provider.pkgname) {
                  <li class="pkg-chip">
                    <span class="pkg-chip__name" [title]="dep.soname">{{ dep.soname }}</span>
                    <span class="pkg-chip__note" [title]="provider.pkgname">{{ provider.pkgname }}</span>
                  </li>
                }
              }
            </ul>
          }
        </section>
        @if (sources.pluginOwners.length > 0) {
          <section class="pkg-group" [attr.aria-label]="t('pluginOf')">
            <h3 class="pkg-group__label">
              {{ t('pluginOf') }}
              <span class="pkg-group__count">{{ sources.pluginOwners.length }}</span>
            </h3>
            <ul class="pkg-group__list">
              @for (owner of sources.pluginOwners; track owner.pkgname) {
                <li class="pkg-chip">
                  <span class="pkg-chip__name" [title]="owner.pkgname">{{ owner.pkgname }}</span>
                  <span class="pkg-chip__note">{{ t(pkgTypeKeys[owner.pkgType]) }}</span>
                </li>
              }
            </ul>
          </section>
        }
        @if (sources.explicitTriggers.length > 0) {
          <section class="pkg-group" [attr.aria-label]="t('explicitTriggers')">
            <h3 class="pkg-group__label">
              {{ t('explicitTriggers') }}
              <span class="pkg-group__count">{{ sources.explicitTriggers.length }}</span>
            </h3>
            <ul class="pkg-group__list">
              @for (trigger of sources.explicitTriggers; track trigger.pkgname) {
                <li class="pkg-chip">
                  <span class="pkg-chip__name" [title]="trigger.pkgname">{{ trigger.pkgname }}</span>
                  <span class="pkg-chip__note" [title]="trigger.archVersion">{{ trigger.archVersion }}</span>
                </li>
              }
            </ul>
          </section>
        }
      } @else {
        <p class="pkg-group__empty">{{ t('noData') }}</p>
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

  protected readonly skeletonChips = SKELETON_CHIPS;
  protected readonly pkgTypeKeys = PKG_TYPE_KEYS;

  readonly loading = this.resource.isLoading;
  protected readonly failed = resourceFailed(this.resource);
  protected readonly error = this.resource.error;

  readonly data = computed(() => resourceValue(this.resource) ?? null);

  // Each soname chip is one soname and one providing package, so the count matches the chips.
  protected readonly sonameProviderCount = computed(
    () => this.data()?.sonameDependencies.reduce((count, dep) => count + dep.providers.length, 0) ?? 0,
  );

  protected reload(): void {
    this.resource.reload();
  }
}
