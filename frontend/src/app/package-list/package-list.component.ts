import { CAUR_PKG_URL, type PkgList } from '@./shared-lib';
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AppService } from '../app.service';

@Component({
  selector: 'app-package-list',
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './package-list.component.html',
  styleUrl: './package-list.component.css',
})
export class PackageListComponent {
  packageList: PkgList = [];
  loading = true;
  searchTerm: string | undefined;
  searchResults: PkgList = [];
  protected readonly CAUR_PKG_URL = CAUR_PKG_URL;

  constructor(private appService: AppService) {
    void this.getPkgList();
  }

  /**
   * Parse the package list from the CAUR_PKG_LIST_URL. The file parsed is dumped with
   * each database add event by the builder and is always up-to-date therefore.
   * We could probably make this an API call to the backend to get the list, but since we
   * already have the list, we can just do it like that.
   * I Might change this in the future if we want to show more / different information.
   * @param pkgList
   */
  parsePkgList = (pkgList: string): PkgList => {
    const pkgArray: PkgList = [];

    const toParse = pkgList.split(/\n/g);
    for (const pkg of toParse) {
      if (pkg === '' || pkg.includes('pkg.tar.zst.sig')) continue;

      // At the time of writing this, the following regex reliably caught the package name
      // this *might* change in the future depending on whether out-of-norm packages are added.
      const pkgname = pkg.split(/(-|-r|.r|-v)[0-9]/, 1)[0];

      pkgArray.push({
        name: pkgname,
        fullString: pkg,
      });
    }

    return pkgArray;
  };

  async getPkgList(): Promise<void> {
    this.appService.getPkgList().subscribe({
      next: (res): void => {
        this.packageList = this.parsePkgList(res.pkglist);
        this.loading = false;
      },
      error: (err): void => {
        console.error(err);
        this.loading = false;
      },
    });
  }

  async searchPackage(): Promise<void> {
    this.loading = true;
    const searchFor = this.searchTerm;
    if (searchFor !== undefined) {
      this.searchResults = this.packageList.filter((pkg) => pkg.name.includes(searchFor));
    }
    this.loading = false;
  }
}
