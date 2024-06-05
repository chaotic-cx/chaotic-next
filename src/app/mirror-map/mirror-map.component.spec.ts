import { ComponentFixture, TestBed } from "@angular/core/testing";

import { MirrorMapComponent } from "./mirror-map.component";

describe("MirrorMapComponent", () => {
    let component: MirrorMapComponent;
    let fixture: ComponentFixture<MirrorMapComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [MirrorMapComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(MirrorMapComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
