import { ComponentFixture, TestBed } from "@angular/core/testing";

import { StatsPage } from "./stats-page";

describe("PackageStatsComponent", () => {
    let component: StatsPage;
    let fixture: ComponentFixture<StatsPage>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [StatsPage],
        }).compileComponents();

        fixture = TestBed.createComponent(StatsPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
