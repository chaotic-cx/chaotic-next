import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MrOverviewComponent } from './mr-overview.component';

describe('MrOverviewComponent', () => {
  let component: MrOverviewComponent;
  let fixture: ComponentFixture<MrOverviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MrOverviewComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MrOverviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
