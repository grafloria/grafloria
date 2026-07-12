/**
 * Unified pointer input pipeline (mouse / pen / touch).
 *
 * This is the FOUNDATION every interaction tool routes through. Instead of the
 * scattered mouse-only + touch listeners the canvas grew organically, this
 * module attaches ONE set of Pointer Events to a host element and emits a
 * single canonical {@link PointerInputEvent} for down/move/up/cancel.
 *
 * Design goals:
 *  - Framework-agnostic + unit-testable (no Angular imports).
 *  - Uses `setPointerCapture` on down / `releasePointerCapture` on up|cancel so
 *    a drag keeps receiving move/up events even after the pointer leaves the
 *    host — no window-level listeners required (this is why capture matters).
 *  - Converts element-local screen coords → world coords via an INJECTED
 *    transform fn, so the controller stays decoupled from the viewBox/zoom math.
 *  - A movement threshold distinguishes a click (no drag) from a drag.
 *  - `dispose()` removes EXACTLY the listeners it added (stored bound refs),
 *    fixing the leak class where `removeEventListener(fn.bind(this))` allocates
 *    a brand-new function that never matches the one that was added.
 */

/** Canonical, device-agnostic pointer phase. */
export type PointerInputType = 'down' | 'move' | 'up' | 'cancel';

/** Which physical device produced the event. */
export type PointerDeviceType = 'mouse' | 'pen' | 'touch';

/** Keyboard modifier snapshot at the moment of the event. */
export interface PointerModifiers {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
}

/**
 * The single canonical event every interaction tool consumes.
 * Carries both world- and screen-space coordinates plus enough raw signal
 * (buttons, modifiers, pressure, hit target) that tools never need to reach
 * back into the native event — though `originalEvent` is provided for escapes.
 */
export interface PointerInputEvent {
  type: PointerInputType;
  /** World-space X (output of the injected screen→world transform). */
  worldX: number;
  /** World-space Y (output of the injected screen→world transform). */
  worldY: number;
  /** Element-local screen X in CSS px (clientX − host.left). */
  screenX: number;
  /** Element-local screen Y in CSS px (clientY − host.top). */
  screenY: number;
  /** Bitmask of currently-pressed buttons (`PointerEvent.buttons`). */
  buttons: number;
  /** The button whose state changed (`PointerEvent.button`; -1 for pure moves). */
  button: number;
  modifiers: PointerModifiers;
  pointerId: number;
  pointerType: PointerDeviceType;
  /** Normalized pressure 0..1 (0.5 for a typical mouse press, 0 when unknown). */
  pressure: number;
  /**
   * True once this pointer's sequence has moved past `dragThreshold`.
   * `up` events carry the final value so a consumer can treat
   * `type === 'up' && !isDrag` as a click.
   */
  isDrag: boolean;
  /** Hit-target hook — the DOM target under the pointer (`event.target`). */
  target: EventTarget | null;
  /** Escape hatch to the raw native event. */
  originalEvent: PointerEvent;
}

/** Injected screen→world transform. Receives element-local CSS px. */
export type ScreenToWorldFn = (
  screenX: number,
  screenY: number,
) => { worldX: number; worldY: number };

/** Sink for canonical events. */
export type PointerInputListener = (event: PointerInputEvent) => void;

export interface PointerInputControllerOptions {
  /** Converts element-local screen coords → world coords. */
  screenToWorld: ScreenToWorldFn;
  /** Called for every canonical event. */
  onEvent: PointerInputListener;
  /**
   * Movement (in screen px) a pointer must travel from its down position
   * before the sequence is considered a drag rather than a click. Default 4.
   */
  dragThreshold?: number;
}

/** Per-pointer state tracked between down and up/cancel. */
interface ActivePointer {
  startScreenX: number;
  startScreenY: number;
  isDragging: boolean;
}

const DEFAULT_DRAG_THRESHOLD = 4;

/**
 * Attaches one unified set of Pointer Events to a host element and emits
 * canonical {@link PointerInputEvent}s. Construct it, and call {@link dispose}
 * to detach — nothing else leaks.
 */
export class PointerInputController {
  private readonly host: HTMLElement;
  private readonly screenToWorld: ScreenToWorldFn;
  private readonly onEvent: PointerInputListener;
  private readonly dragThreshold: number;

  /** Live pointers between down and up/cancel, keyed by pointerId. */
  private readonly active = new Map<number, ActivePointer>();

  // Bound handler refs — captured ONCE so add/removeEventListener use the same
  // function identity. This is the fix for the classic .bind()-in-destroy leak.
  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerUp: (e: PointerEvent) => void;
  private readonly onPointerCancel: (e: PointerEvent) => void;

  private disposed = false;

  constructor(host: HTMLElement, options: PointerInputControllerOptions) {
    this.host = host;
    this.screenToWorld = options.screenToWorld;
    this.onEvent = options.onEvent;
    this.dragThreshold =
      options.dragThreshold != null && options.dragThreshold >= 0
        ? options.dragThreshold
        : DEFAULT_DRAG_THRESHOLD;

    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.onPointerCancel = this.handlePointerCancel.bind(this);

    this.host.addEventListener('pointerdown', this.onPointerDown);
    this.host.addEventListener('pointermove', this.onPointerMove);
    this.host.addEventListener('pointerup', this.onPointerUp);
    this.host.addEventListener('pointercancel', this.onPointerCancel);
  }

  /** True while at least one pointer is between down and up/cancel. */
  get hasActivePointers(): boolean {
    return this.active.size > 0;
  }

  /** Whether the given pointer (or any active pointer) has crossed the drag threshold. */
  isDragging(pointerId?: number): boolean {
    if (pointerId != null) {
      return this.active.get(pointerId)?.isDragging ?? false;
    }
    for (const p of this.active.values()) {
      if (p.isDragging) {
        return true;
      }
    }
    return false;
  }

  private handlePointerDown(event: PointerEvent): void {
    const { screenX, screenY } = this.localCoords(event);
    this.active.set(event.pointerId, {
      startScreenX: screenX,
      startScreenY: screenY,
      isDragging: false,
    });

    // Route the whole gesture to us even if the pointer leaves the host.
    this.capture(event.pointerId);

    this.emit('down', event, screenX, screenY, false);
  }

  private handlePointerMove(event: PointerEvent): void {
    const { screenX, screenY } = this.localCoords(event);
    const state = this.active.get(event.pointerId);

    if (state && !state.isDragging) {
      const dx = screenX - state.startScreenX;
      const dy = screenY - state.startScreenY;
      if (dx * dx + dy * dy > this.dragThreshold * this.dragThreshold) {
        state.isDragging = true;
      }
    }

    this.emit('move', event, screenX, screenY, state?.isDragging ?? false);
  }

  private handlePointerUp(event: PointerEvent): void {
    const { screenX, screenY } = this.localCoords(event);
    const wasDragging = this.active.get(event.pointerId)?.isDragging ?? false;

    this.emit('up', event, screenX, screenY, wasDragging);

    this.release(event.pointerId);
    this.active.delete(event.pointerId);
  }

  private handlePointerCancel(event: PointerEvent): void {
    const { screenX, screenY } = this.localCoords(event);
    const wasDragging = this.active.get(event.pointerId)?.isDragging ?? false;

    this.emit('cancel', event, screenX, screenY, wasDragging);

    this.release(event.pointerId);
    this.active.delete(event.pointerId);
  }

  /** Element-local CSS px relative to the host's top-left. */
  private localCoords(event: PointerEvent): { screenX: number; screenY: number } {
    const rect = this.host.getBoundingClientRect();
    return {
      screenX: event.clientX - rect.left,
      screenY: event.clientY - rect.top,
    };
  }

  private emit(
    type: PointerInputType,
    event: PointerEvent,
    screenX: number,
    screenY: number,
    isDrag: boolean,
  ): void {
    const { worldX, worldY } = this.screenToWorld(screenX, screenY);
    this.onEvent({
      type,
      worldX,
      worldY,
      screenX,
      screenY,
      buttons: event.buttons ?? 0,
      button: event.button ?? -1,
      modifiers: {
        shift: event.shiftKey,
        ctrl: event.ctrlKey,
        alt: event.altKey,
        meta: event.metaKey,
      },
      pointerId: event.pointerId,
      pointerType: normalizePointerType(event.pointerType),
      pressure: typeof event.pressure === 'number' ? event.pressure : 0,
      isDrag,
      target: event.target,
      originalEvent: event,
    });
  }

  /** Guarded setPointerCapture — jsdom / older engines may lack it or throw. */
  private capture(pointerId: number): void {
    const host = this.host as HTMLElement & {
      setPointerCapture?: (id: number) => void;
    };
    if (typeof host.setPointerCapture === 'function') {
      try {
        host.setPointerCapture(pointerId);
      } catch {
        /* pointer already gone / unsupported — non-fatal */
      }
    }
  }

  /** Guarded releasePointerCapture. */
  private release(pointerId: number): void {
    const host = this.host as HTMLElement & {
      releasePointerCapture?: (id: number) => void;
    };
    if (typeof host.releasePointerCapture === 'function') {
      try {
        host.releasePointerCapture(pointerId);
      } catch {
        /* nothing captured — non-fatal */
      }
    }
  }

  /**
   * Detach every listener this controller added and drop all pointer state.
   * Idempotent. Removes the EXACT bound refs registered in the constructor.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.host.removeEventListener('pointerdown', this.onPointerDown);
    this.host.removeEventListener('pointermove', this.onPointerMove);
    this.host.removeEventListener('pointerup', this.onPointerUp);
    this.host.removeEventListener('pointercancel', this.onPointerCancel);
    this.active.clear();
  }
}

/** Coerce the native pointerType string into our closed device union. */
function normalizePointerType(raw: string | undefined): PointerDeviceType {
  if (raw === 'pen' || raw === 'touch') {
    return raw;
  }
  return 'mouse';
}
