import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { MiscStatsComponent } from './misc-stats.component';

describe('MiscStatsComponent', () => {
  let component: MiscStatsComponent;
  let fixture: ComponentFixture<MiscStatsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MiscStatsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MiscStatsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
