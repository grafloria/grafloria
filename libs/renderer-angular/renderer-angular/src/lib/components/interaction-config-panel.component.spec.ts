import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InteractionConfigPanelComponent } from './interaction-config-panel.component';

describe('InteractionConfigPanelComponent', () => {
  let component: InteractionConfigPanelComponent;
  let fixture: ComponentFixture<InteractionConfigPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InteractionConfigPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(InteractionConfigPanelComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with collapsed state based on expanded input', () => {
    component.expanded = false;
    component.ngOnInit();
    expect(component.isCollapsed).toBe(true);

    component.expanded = true;
    component.ngOnInit();
    expect(component.isCollapsed).toBe(false);
  });

  it('should toggle collapse state', () => {
    component.isCollapsed = true;
    component.toggleCollapse();
    expect(component.isCollapsed).toBe(false);

    component.toggleCollapse();
    expect(component.isCollapsed).toBe(true);
  });

  it('should toggle advanced settings collapse state', () => {
    component.isAdvancedCollapsed = true;
    component.toggleAdvanced();
    expect(component.isAdvancedCollapsed).toBe(false);

    component.toggleAdvanced();
    expect(component.isAdvancedCollapsed).toBe(true);
  });

  it('should have correct interaction mode options', () => {
    expect(component.interactionModes).toHaveLength(3);
    expect(component.interactionModes[0].value).toBe('direct');
    expect(component.interactionModes[1].value).toBe('deliberate');
    expect(component.interactionModes[2].value).toBe('smart');
  });

  it('should have correct port visibility options', () => {
    expect(component.portVisibilityOptions).toHaveLength(3);
    expect(component.portVisibilityOptions[0].value).toBe('always');
    expect(component.portVisibilityOptions[1].value).toBe('on-hover');
    expect(component.portVisibilityOptions[2].value).toBe('hidden');
  });

  it('should have correct connection line style options', () => {
    expect(component.connectionLineStyles).toHaveLength(2);
    expect(component.connectionLineStyles[0].value).toBe('bezier');
    expect(component.connectionLineStyles[1].value).toBe('straight');
  });

  it('should emit configChanged event on mode change', () => {
    const mockEngine = {
      getInteractionConfig: () => ({ mode: 'direct' }),
      setInteractionConfig: jest.fn(),
    } as any;

    component.engine = mockEngine;
    component.ngOnInit();

    spyOn(component.configChanged, 'emit');

    component.onModeChange('smart');

    expect(component.configChanged.emit).toHaveBeenCalledWith({ mode: 'smart' });
    expect(mockEngine.setInteractionConfig).toHaveBeenCalledWith({ mode: 'smart' });
  });

  it('should emit configChanged event on toggle change', () => {
    const mockEngine = {
      getInteractionConfig: () => ({ showConnectionPreview: true }),
      setInteractionConfig: jest.fn(),
    } as any;

    component.engine = mockEngine;
    component.ngOnInit();

    spyOn(component.configChanged, 'emit');

    component.onToggleChange('showConnectionPreview', false);

    expect(component.configChanged.emit).toHaveBeenCalledWith({ showConnectionPreview: false });
    expect(mockEngine.setInteractionConfig).toHaveBeenCalledWith({ showConnectionPreview: false });
  });
});
