import { type ComponentFixture, TestBed } from "@angular/core/testing"

import { PackageSearchComponent } from "./package-search.component"

describe("PackageSearchComponent", () => {
    let component: PackageSearchComponent
    let fixture: ComponentFixture<PackageSearchComponent>

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [PackageSearchComponent],
        }).compileComponents()

        fixture = TestBed.createComponent(PackageSearchComponent)
        component = fixture.componentInstance
        fixture.detectChanges()
    })

    it("should create", () => {
        expect(component).toBeTruthy()
    })
})
