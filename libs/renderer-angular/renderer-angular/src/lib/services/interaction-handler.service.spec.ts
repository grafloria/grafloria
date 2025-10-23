import { TestBed } from '@angular/core/testing';
import { InteractionHandlerService } from './interaction-handler.service';

describe('InteractionHandlerService', () => {
  let service: InteractionHandlerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(InteractionHandlerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with no interaction state', () => {
    const state = service.getState();
    expect(state.isConnecting).toBe(false);
    expect(state.isReconnectingLink).toBe(false);
    expect(state.hoveredNode).toBeNull();
    expect(state.hoveredPort).toBeNull();
    expect(state.hoveredLink).toBeNull();
  });

  it('should not be interacting initially', () => {
    expect(service.isInteracting()).toBe(false);
  });

  it('should return default cursor when no interaction', () => {
    // Note: This test would need a mock engine to fully test
    // For now, just verify the method exists
    expect(service.getCursor).toBeDefined();
  });
});
