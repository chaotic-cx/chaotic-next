import { ComponentFixture, TestBed } from "@angular/core/testing"

import { NewsChannelComponent } from "./news-channel.component"

describe("NewsChannelComponent", () => {
    let component: NewsChannelComponent
    let fixture: ComponentFixture<NewsChannelComponent>

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [NewsChannelComponent],
        }).compileComponents()

        fixture = TestBed.createComponent(NewsChannelComponent)
        component = fixture.componentInstance
        fixture.detectChanges()
    })

    it("should create", () => {
        expect(component).toBeTruthy()
    })
})
