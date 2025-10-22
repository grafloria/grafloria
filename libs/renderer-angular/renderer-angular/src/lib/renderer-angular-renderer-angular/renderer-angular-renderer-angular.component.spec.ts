import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RendererAngularRendererAngularComponent } from './renderer-angular-renderer-angular.component';

describe('RendererAngularRendererAngularComponent', () => {
  let component: RendererAngularRendererAngularComponent;
  let fixture: ComponentFixture<RendererAngularRendererAngularComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RendererAngularRendererAngularComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RendererAngularRendererAngularComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
