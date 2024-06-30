import { CAUR_BACKEND_URL, PkgList } from "@./shared-lib"
import { CommonModule } from "@angular/common"
import { HttpClient } from "@angular/common/http"
import { Component } from "@angular/core"
import { ReactiveFormsModule } from "@angular/forms"

@Component({
    selector: "app-package-list",
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: "./package-list.component.html",
    styleUrl: "./package-list.component.css",
})
export class PackageListComponent {
    packageList: any[] = []

    constructor(private httpClient: HttpClient) {
        this.getPkgList()
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
        const pkgArray: PkgList = []

        pkgList.split(/\n/g).forEach((pkg: string): void => {
            if (pkg === "" || pkg.includes("pkg.tar.zst.sig")) return

            // At the time of writing this, the following regex reliably caught the package name
            // this *might* change in the future depending on whether out of norm packages are added.
            const pkgname = pkg.split(/(-|-r|.r|-v)[0-9]/, 1)[0]

            pkgArray.push({
                name: pkgname,
                fullString: pkg,
            })
        })

        return pkgArray
    }

    getPkgList = (): void => {
        this.httpClient.get(`${CAUR_BACKEND_URL}/misc/pkglist`).subscribe((res): void => {
            // @ts-ignore
            this.packageList = this.parsePkgList(res.pkglist)
        })
    }
}
