import { type ComponentFixture, TestBed } from "@angular/core/testing"

import { ChaoticAttractorComponent } from "./chaotic-attractor.component"

describe("ChaoticAttractorComponent", () => {
    let component: ChaoticAttractorComponent
    let fixture: ComponentFixture<ChaoticAttractorComponent>

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [ChaoticAttractorComponent],
        }).compileComponents()

        fixture = TestBed.createComponent(ChaoticAttractorComponent)
        component = fixture.componentInstance
        fixture.detectChanges()
    })

    it("should create", () => {
        expect(component).toBeTruthy()
    })
})
