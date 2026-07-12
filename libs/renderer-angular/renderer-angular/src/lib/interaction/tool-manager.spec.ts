import {
  ToolManager,
  ToolActions,
  ToolPointerEvent,
  ToolManagerConfig,
  HitTestResult,
  SceneHitTester,
  MarqueeSelection,
  modifiersToSelectionMode,
  directionToIntersectionMode,
  buildMarqueeRect,
} from './tool-manager';

const NO_MODS = { shift: false, ctrl: false, alt: false, meta: false };

function ev(
  type: ToolPointerEvent['type'],
  over: Partial<ToolPointerEvent> = {},
): ToolPointerEvent {
  return {
    type,
    worldX: 0,
    worldY: 0,
    screenX: 0,
    screenY: 0,
    button: type === 'down' ? 0 : -1,
    buttons: type === 'up' ? 0 : 1,
    modifiers: { ...NO_MODS },
    ...over,
  };
}

/** A spy sink recording every action call for assertions. */
function makeActions() {
  return {
    beginNodeDrag: jest.fn(),
    updateNodeDrag: jest.fn(),
    endNodeDrag: jest.fn(),
    beginMarquee: jest.fn(),
    updateMarquee: jest.fn(),
    endMarquee: jest.fn(),
    beginLinkDraw: jest.fn(),
    updateLinkDraw: jest.fn(),
    endLinkDraw: jest.fn(),
    beginPan: jest.fn(),
    updatePan: jest.fn(),
    endPan: jest.fn(),
  } satisfies Required<ToolActions>;
}

function makeManager(
  hit: HitTestResult,
  config: Partial<ToolManagerConfig> = {},
) {
  const actions = makeActions();
  const hitTest: SceneHitTester = jest.fn(() => hit);
  const manager = new ToolManager(hitTest, actions, {
    mode: 'direct',
    dragThreshold: 4,
    ...config,
  });
  return { manager, actions, hitTest };
}

describe('ToolManager — pure modifier / direction helpers', () => {
  it('maps modifiers to a selection mode with shift > meta/ctrl > alt precedence', () => {
    expect(modifiersToSelectionMode(NO_MODS)).toBe('replace');
    expect(modifiersToSelectionMode({ ...NO_MODS, shift: true })).toBe('add');
    expect(modifiersToSelectionMode({ ...NO_MODS, meta: true })).toBe('toggle');
    expect(modifiersToSelectionMode({ ...NO_MODS, ctrl: true })).toBe('toggle');
    expect(modifiersToSelectionMode({ ...NO_MODS, alt: true })).toBe('subtract');
    // precedence
    expect(modifiersToSelectionMode({ shift: true, ctrl: true, alt: true, meta: true })).toBe('add');
    expect(modifiersToSelectionMode({ ...NO_MODS, ctrl: true, alt: true })).toBe('toggle');
  });

  it('maps drag direction to contain (L→R) vs intersect (R→L)', () => {
    expect(directionToIntersectionMode(10, 40)).toBe('contain'); // rightward
    expect(directionToIntersectionMode(10, 10)).toBe('contain'); // straight down
    expect(directionToIntersectionMode(40, 10)).toBe('intersect'); // leftward
  });

  it('builds a normalized world rect from two points regardless of order', () => {
    const rect = buildMarqueeRect(
      ev('down', { worldX: 40, worldY: 30 }),
      ev('move', { worldX: 10, worldY: 80 }),
    );
    expect(rect).toEqual({ left: 10, top: 30, right: 40, bottom: 80, width: 30, height: 50 });
  });
});

describe('ToolManager — arbitration (one tool per gesture)', () => {
  it('arms link-draw and commits immediately when the down hits a port', () => {
    const { manager, actions } = makeManager({ kind: 'port', nodeId: 'n1' });
    manager.pointerDown(ev('down'));
    expect(manager.armedTool).toBe('link-draw');
    expect(manager.activeTool).toBe('link-draw'); // committed with no threshold
    expect(actions.beginLinkDraw).toHaveBeenCalledTimes(1);
    expect(actions.beginNodeDrag).not.toHaveBeenCalled();
    expect(actions.beginMarquee).not.toHaveBeenCalled();
  });

  it('arms node-drag on a node hit but does NOT commit before the threshold', () => {
    const { manager, actions } = makeManager({ kind: 'node', nodeId: 'n1', nodeWasSelected: true });
    manager.pointerDown(ev('down', { screenX: 0, screenY: 0 }));
    expect(manager.armedTool).toBe('node-drag');
    expect(manager.activeTool).toBeNull(); // pending threshold
    expect(actions.beginNodeDrag).not.toHaveBeenCalled();
  });

  it('arms marquee on an empty hit', () => {
    const { manager } = makeManager({ kind: 'empty' });
    manager.pointerDown(ev('down'));
    expect(manager.armedTool).toBe('marquee');
    expect(manager.activeTool).toBeNull();
  });

  it('arms pan on the middle button and commits immediately, ignoring the hit', () => {
    const { manager, actions } = makeManager({ kind: 'node', nodeId: 'n1', nodeWasSelected: true });
    manager.pointerDown(ev('down', { button: 1 }));
    expect(manager.armedTool).toBe('pan');
    expect(manager.activeTool).toBe('pan');
    expect(actions.beginPan).toHaveBeenCalledTimes(1);
    expect(actions.beginNodeDrag).not.toHaveBeenCalled();
  });

  it('arms select (no drag) when a link is clicked', () => {
    const { manager, actions } = makeManager({ kind: 'link' });
    manager.pointerDown(ev('down'));
    manager.pointerMove(ev('move', { screenX: 100, screenY: 100 }));
    manager.pointerUp(ev('up', { screenX: 100, screenY: 100 }));
    expect(actions.beginNodeDrag).not.toHaveBeenCalled();
    expect(actions.beginMarquee).not.toHaveBeenCalled();
  });

  it('ignores the right button entirely', () => {
    const { manager } = makeManager({ kind: 'node', nodeId: 'n1', nodeWasSelected: true });
    manager.pointerDown(ev('down', { button: 2 }));
    expect(manager.armedTool).toBeNull();
    expect(manager.hasGesture).toBe(true);
  });
});

describe('ToolManager — click-vs-drag threshold', () => {
  it('a click (movement within threshold) never begins a node drag', () => {
    const { manager, actions } = makeManager({ kind: 'node', nodeId: 'n1', nodeWasSelected: true });
    manager.pointerDown(ev('down', { screenX: 0, screenY: 0 }));
    manager.pointerMove(ev('move', { screenX: 2, screenY: 2 })); // dist ~2.8 < 4
    manager.pointerUp(ev('up', { screenX: 2, screenY: 2 }));

    expect(actions.beginNodeDrag).not.toHaveBeenCalled();
    expect(actions.updateNodeDrag).not.toHaveBeenCalled();
    expect(actions.endNodeDrag).not.toHaveBeenCalled();
  });

  it('a drag (movement past threshold) begins → updates → ends node drag exactly once each', () => {
    const { manager, actions } = makeManager({ kind: 'node', nodeId: 'n1', nodeWasSelected: true });
    const down = ev('down', { screenX: 0, screenY: 0 });
    manager.pointerDown(down);
    manager.pointerMove(ev('move', { screenX: 3, screenY: 0 })); // 3 < 4, still a click
    expect(actions.beginNodeDrag).not.toHaveBeenCalled();

    manager.pointerMove(ev('move', { screenX: 10, screenY: 0 })); // crosses threshold
    expect(actions.beginNodeDrag).toHaveBeenCalledTimes(1);
    expect(manager.activeTool).toBe('node-drag');
    // commit move also forwards an update
    expect(actions.updateNodeDrag).toHaveBeenCalledTimes(1);

    manager.pointerMove(ev('move', { screenX: 20, screenY: 0 }));
    expect(actions.updateNodeDrag).toHaveBeenCalledTimes(2);

    manager.pointerUp(ev('up', { screenX: 20, screenY: 0 }));
    expect(actions.endNodeDrag).toHaveBeenCalledTimes(1);
    // beginNodeDrag receives the down event so the host can anchor deltas to it
    expect(actions.beginNodeDrag.mock.calls[0][1]).toBe(down);
  });

  it('respects a custom dragThreshold', () => {
    const { manager, actions } = makeManager(
      { kind: 'node', nodeId: 'n1', nodeWasSelected: true },
      { dragThreshold: 20 },
    );
    manager.pointerDown(ev('down', { screenX: 0, screenY: 0 }));
    manager.pointerMove(ev('move', { screenX: 10, screenY: 0 })); // 10 < 20
    expect(actions.beginNodeDrag).not.toHaveBeenCalled();
    manager.pointerMove(ev('move', { screenX: 25, screenY: 0 })); // 25 > 20
    expect(actions.beginNodeDrag).toHaveBeenCalledTimes(1);
  });
});

describe('ToolManager — DELIBERATE gating', () => {
  it('refuses to arm node-drag on an unselected node in DELIBERATE mode', () => {
    const { manager, actions } = makeManager(
      { kind: 'node', nodeId: 'n1', nodeWasSelected: false },
      { mode: 'deliberate' },
    );
    manager.pointerDown(ev('down', { screenX: 0, screenY: 0 }));
    expect(manager.armedTool).toBe('select');

    // Even a large drag must not move the node — it was not selected first.
    manager.pointerMove(ev('move', { screenX: 50, screenY: 50 }));
    manager.pointerUp(ev('up', { screenX: 50, screenY: 50 }));
    expect(actions.beginNodeDrag).not.toHaveBeenCalled();
    expect(actions.updateNodeDrag).not.toHaveBeenCalled();
  });

  it('arms node-drag on an ALREADY-selected node in DELIBERATE mode', () => {
    const { manager, actions } = makeManager(
      { kind: 'node', nodeId: 'n1', nodeWasSelected: true },
      { mode: 'deliberate' },
    );
    manager.pointerDown(ev('down', { screenX: 0, screenY: 0 }));
    expect(manager.armedTool).toBe('node-drag');
    manager.pointerMove(ev('move', { screenX: 50, screenY: 0 }));
    expect(actions.beginNodeDrag).toHaveBeenCalledTimes(1);
  });

  it('DIRECT mode arms node-drag even on an unselected node', () => {
    const { manager, actions } = makeManager(
      { kind: 'node', nodeId: 'n1', nodeWasSelected: false },
      { mode: 'direct' },
    );
    manager.pointerDown(ev('down', { screenX: 0, screenY: 0 }));
    expect(manager.armedTool).toBe('node-drag');
    manager.pointerMove(ev('move', { screenX: 50, screenY: 0 }));
    expect(actions.beginNodeDrag).toHaveBeenCalledTimes(1);
  });
});

describe('ToolManager — marquee tool', () => {
  it('does not select before the threshold, then feeds selectInRectangle payloads', () => {
    const { manager, actions } = makeManager({ kind: 'empty' });
    manager.pointerDown(ev('down', { worldX: 0, worldY: 0, screenX: 0, screenY: 0 }));
    manager.pointerMove(ev('move', { worldX: 2, worldY: 2, screenX: 2, screenY: 2 })); // click-range
    expect(actions.beginMarquee).not.toHaveBeenCalled();

    manager.pointerMove(ev('move', { worldX: 100, worldY: 60, screenX: 100, screenY: 60 }));
    expect(actions.beginMarquee).toHaveBeenCalledTimes(1);
    expect(actions.updateMarquee).toHaveBeenCalledTimes(1);

    const sel = actions.updateMarquee.mock.calls[0][0] as MarqueeSelection;
    expect(sel.rect).toEqual({ left: 0, top: 0, right: 100, bottom: 60, width: 100, height: 60 });
    expect(sel.intersectionMode).toBe('contain'); // dragged rightward
    expect(sel.selectionMode).toBe('replace'); // no modifiers

    manager.pointerUp(ev('up', { worldX: 100, worldY: 60, screenX: 100, screenY: 60 }));
    expect(actions.endMarquee).toHaveBeenCalledTimes(1);
  });

  it('reports intersect + add when dragging leftward with Shift', () => {
    const { manager, actions } = makeManager({ kind: 'empty' });
    manager.pointerDown(ev('down', { worldX: 200, worldY: 200, screenX: 200, screenY: 200 }));
    manager.pointerMove(
      ev('move', {
        worldX: 50,
        worldY: 260,
        screenX: 50,
        screenY: 260,
        modifiers: { ...NO_MODS, shift: true },
      }),
    );
    const sel = actions.updateMarquee.mock.calls[0][0] as MarqueeSelection;
    expect(sel.intersectionMode).toBe('intersect'); // leftward
    expect(sel.selectionMode).toBe('add'); // shift
    expect(sel.rect).toEqual({ left: 50, top: 200, right: 200, bottom: 260, width: 150, height: 60 });
  });
});

describe('ToolManager — gesture hygiene', () => {
  it('only one tool ever commits per gesture (node hit → node-drag, not marquee)', () => {
    const { manager, actions } = makeManager({ kind: 'node', nodeId: 'n1', nodeWasSelected: true });
    manager.pointerDown(ev('down', { screenX: 0, screenY: 0 }));
    manager.pointerMove(ev('move', { screenX: 40, screenY: 40 }));
    expect(actions.beginNodeDrag).toHaveBeenCalledTimes(1);
    expect(actions.beginMarquee).not.toHaveBeenCalled();
    expect(actions.beginPan).not.toHaveBeenCalled();
    expect(actions.beginLinkDraw).not.toHaveBeenCalled();
  });

  it('a fresh down abandons a dangling gesture and re-hit-tests', () => {
    const actions = makeActions();
    let hit: HitTestResult = { kind: 'node', nodeId: 'n1', nodeWasSelected: true };
    const manager = new ToolManager(() => hit, actions, { mode: 'direct', dragThreshold: 4 });

    manager.pointerDown(ev('down', { screenX: 0, screenY: 0 }));
    manager.pointerMove(ev('move', { screenX: 40, screenY: 0 })); // committed node-drag
    expect(manager.activeTool).toBe('node-drag');

    // A new down without an up: the old drag must be ended and a new gesture armed.
    hit = { kind: 'empty' };
    manager.pointerDown(ev('down', { screenX: 100, screenY: 100 }));
    expect(actions.endNodeDrag).toHaveBeenCalledTimes(1);
    expect(manager.armedTool).toBe('marquee');
  });

  it('pointerCancel ends an active tool and clears the gesture', () => {
    const { manager, actions } = makeManager({ kind: 'node', nodeId: 'n1', nodeWasSelected: true });
    manager.pointerDown(ev('down', { screenX: 0, screenY: 0 }));
    manager.pointerMove(ev('move', { screenX: 40, screenY: 0 }));
    manager.pointerCancel(ev('cancel', { screenX: 40, screenY: 0 }));
    expect(actions.endNodeDrag).toHaveBeenCalledTimes(1);
    expect(manager.hasGesture).toBe(false);
    expect(manager.activeTool).toBeNull();
  });

  it('a move with no active gesture is a no-op (hover is the host\'s job)', () => {
    const { manager, actions } = makeManager({ kind: 'empty' });
    manager.pointerMove(ev('move', { screenX: 10, screenY: 10 }));
    expect(actions.beginMarquee).not.toHaveBeenCalled();
    expect(actions.updateMarquee).not.toHaveBeenCalled();
  });
});
