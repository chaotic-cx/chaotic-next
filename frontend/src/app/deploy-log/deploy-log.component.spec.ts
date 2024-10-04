import { type ComponentFixture, TestBed } from "@angular/core/testing"

import { DeployLogComponent } from "./deploy-log.component"

describe("DeployLogComponent", () => {
    let component: DeployLogComponent
    let fixture: ComponentFixture<DeployLogComponent>

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [DeployLogComponent],
        }).compileComponents()

        fixture = TestBed.createComponent(DeployLogComponent)
        component = fixture.componentInstance
        fixture.detectChanges()
    })

    it("should create", () => {
        expect(component).toBeTruthy()
    })
})
