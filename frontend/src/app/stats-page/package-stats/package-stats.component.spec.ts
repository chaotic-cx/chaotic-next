import { ComponentFixture, TestBed } from "@angular/core/testing"

import { PackageStatsComponent } from "./package-stats.component"

describe("PackageStatsComponent", () => {
    let component: PackageStatsComponent
    let fixture: ComponentFixture<PackageStatsComponent>

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [PackageStatsComponent],
        }).compileComponents()

        fixture = TestBed.createComponent(PackageStatsComponent)
        component = fixture.componentInstance
        fixture.detectChanges()
    })

    it("should create", () => {
        expect(component).toBeTruthy()
    })
})
