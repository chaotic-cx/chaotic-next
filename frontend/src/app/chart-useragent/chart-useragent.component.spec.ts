import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChartUseragentComponent } from './chart-useragent.component';

describe('ChartUseragentComponent', () => {
  let component: ChartUseragentComponent;
  let fixture: ComponentFixture<ChartUseragentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChartUseragentComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ChartUseragentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
