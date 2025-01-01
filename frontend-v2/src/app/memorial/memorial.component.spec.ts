import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { MemorialComponent } from './memorial.component';

describe('MemorialComponent', () => {
  let component: MemorialComponent;
  let fixture: ComponentFixture<MemorialComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemorialComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MemorialComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
