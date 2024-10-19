import { type ComponentFixture, TestBed } from "@angular/core/testing"

import { MemorialV2Component } from "./memorial-v2.component"

describe("MemorialV2Component", () => {
    let component: MemorialV2Component
    let fixture: ComponentFixture<MemorialV2Component>

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [MemorialV2Component],
        }).compileComponents()

        fixture = TestBed.createComponent(MemorialV2Component)
        component = fixture.componentInstance
        fixture.detectChanges()
    })

    it("should create", () => {
        expect(component).toBeTruthy()
    })
})
