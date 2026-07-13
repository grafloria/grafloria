import { RenderScheduler } from './render-scheduler';

/** A hand-cranked rAF so frames only run when the test says so. */
function fakeFrames() {
  const queue = new Map<number, (t: number) => void>();
  let next = 1;
  return {
    requestFrame: (cb: (t: number) => void) => {
      const handle = next++;
      queue.set(handle, cb);
      return handle;
    },
    cancelFrame: (handle: number) => {
      queue.delete(handle);
    },
    /** Run every queued frame. */
    tick(): void {
      const callbacks = [...queue.values()];
      queue.clear();
      for (const cb of callbacks) cb(0);
    },
    get queued(): number {
      return queue.size;
    },
  };
}

describe('RenderScheduler', () => {
  it('coalesces a burst of schedule() calls into ONE frame', () => {
    const frames = fakeFrames();
    const onFrame = jest.fn();
    const scheduler = new RenderScheduler({ onFrame, ...frames });

    for (let i = 0; i < 25; i++) scheduler.schedule();

    expect(onFrame).not.toHaveBeenCalled(); // nothing paints synchronously
    expect(frames.queued).toBe(1);

    frames.tick();

    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(scheduler.stats.scheduled).toBe(25);
    expect(scheduler.stats.coalesced).toBe(24);
    expect(scheduler.stats.painted).toBe(1);
  });

  it('paints again on the next tick after the frame has run', () => {
    const frames = fakeFrames();
    const onFrame = jest.fn();
    const scheduler = new RenderScheduler({ onFrame, ...frames });

    scheduler.schedule();
    frames.tick();
    scheduler.schedule();
    frames.tick();

    expect(onFrame).toHaveBeenCalledTimes(2);
  });

  it('drops the frame when shouldSkip() says nothing changed (idle-skip)', () => {
    const frames = fakeFrames();
    const onFrame = jest.fn();
    let skip = true;
    const scheduler = new RenderScheduler({ onFrame, shouldSkip: () => skip, ...frames });

    scheduler.schedule();
    frames.tick();
    expect(onFrame).not.toHaveBeenCalled();
    expect(scheduler.stats.skipped).toBe(1);

    skip = false;
    scheduler.schedule();
    frames.tick();
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it('evaluates shouldSkip() inside the frame, not at schedule time', () => {
    const frames = fakeFrames();
    const onFrame = jest.fn();
    let skip = true;
    const scheduler = new RenderScheduler({ onFrame, shouldSkip: () => skip, ...frames });

    scheduler.schedule(); // at this instant the state says "skip"
    skip = false; // …but by the time the frame runs, something changed
    frames.tick();

    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it('flush() paints synchronously and cancels the queued frame', () => {
    const frames = fakeFrames();
    const onFrame = jest.fn();
    const scheduler = new RenderScheduler({ onFrame, shouldSkip: () => true, ...frames });

    scheduler.schedule();
    scheduler.flush();

    expect(onFrame).toHaveBeenCalledTimes(1); // painted despite shouldSkip
    expect(frames.queued).toBe(0);

    frames.tick(); // the cancelled frame must not double-paint
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it('a queued frame that a flush() already satisfied does not paint twice', () => {
    const frames = fakeFrames();
    const onFrame = jest.fn();
    const scheduler = new RenderScheduler({ onFrame, ...frames });

    // A frame is queued, then something forces a synchronous paint, then MORE
    // work arrives: exactly one further frame must run.
    scheduler.schedule();
    scheduler.flush();
    expect(onFrame).toHaveBeenCalledTimes(1);

    scheduler.schedule();
    frames.tick();
    expect(onFrame).toHaveBeenCalledTimes(2);
  });

  it('dispose() cancels the pending frame and ignores later schedules', () => {
    const frames = fakeFrames();
    const onFrame = jest.fn();
    const scheduler = new RenderScheduler({ onFrame, ...frames });

    scheduler.schedule();
    scheduler.dispose();
    frames.tick();
    scheduler.schedule();
    frames.tick();

    expect(onFrame).not.toHaveBeenCalled();
    expect(frames.queued).toBe(0);
  });

  it('reports pending while a frame is in flight', () => {
    const frames = fakeFrames();
    const scheduler = new RenderScheduler({ onFrame: () => undefined, ...frames });

    expect(scheduler.pending).toBe(false);
    scheduler.schedule();
    expect(scheduler.pending).toBe(true);
    frames.tick();
    expect(scheduler.pending).toBe(false);
  });

  it('falls back to the platform rAF when none is injected', async () => {
    const onFrame = jest.fn();
    const scheduler = new RenderScheduler({ onFrame });

    scheduler.schedule();
    await new Promise((resolve) => setTimeout(resolve, 32));

    expect(onFrame).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });
});
