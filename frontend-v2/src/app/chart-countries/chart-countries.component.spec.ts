import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChartCountriesComponent } from './chart-countries.component';

describe('ChartCountriesComponent', () => {
  let component: ChartCountriesComponent;
  let fixture: ComponentFixture<ChartCountriesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChartCountriesComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ChartCountriesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
