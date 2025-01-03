import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChartDownloadsComponent } from './chart-downloads.component';

describe('ChartDownloadsComponent', () => {
  let component: ChartDownloadsComponent;
  let fixture: ComponentFixture<ChartDownloadsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChartDownloadsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ChartDownloadsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
