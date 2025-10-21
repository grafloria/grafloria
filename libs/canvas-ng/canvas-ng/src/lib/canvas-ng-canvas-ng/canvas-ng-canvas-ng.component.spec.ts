import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CanvasNgCanvasNgComponent } from './canvas-ng-canvas-ng.component';

describe('CanvasNgCanvasNgComponent', () => {
  let component: CanvasNgCanvasNgComponent;
  let fixture: ComponentFixture<CanvasNgCanvasNgComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CanvasNgCanvasNgComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CanvasNgCanvasNgComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
