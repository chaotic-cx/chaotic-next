import { type ComponentFixture, TestBed } from "@angular/core/testing"

import { DeployLogFullComponent } from "./deploy-log-full.component"

describe("DeployLogFullComponent", () => {
    let component: DeployLogFullComponent
    let fixture: ComponentFixture<DeployLogFullComponent>

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [DeployLogFullComponent],
        }).compileComponents()

        fixture = TestBed.createComponent(DeployLogFullComponent)
        component = fixture.componentInstance
        fixture.detectChanges()
    })

    it("should create", () => {
        expect(component).toBeTruthy()
    })
})
