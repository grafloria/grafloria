// Diagnostic logging is OFF unless a host asks for it.
//
// The published packages carried ~690 ungated console.log calls. They fired in
// ordinary use — a 500-node grid layout emitted 3,492 lines from the router
// alone, and moving the mouse over a canvas logged a line per port hover
// carrying the consumer's own node labels. The messages were worth keeping; the
// narrating was not.
//
// The two tests that matter are the pair: silent by default (so nobody inherits
// our commentary), and audible on request (so the diagnostics were not simply
// deleted, which would have been the lazy version of this fix).

import { debugLog, isDebugLogging, setDebugLogging } from './debug';
import { OrthogonalRouter } from '../routing/algorithms/OrthogonalRouter';

describe('debug logging', () => {
  let spy: jest.SpyInstance;

  beforeEach(() => {
    spy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    setDebugLogging(false);
    spy.mockRestore();
  });

  it('is off by default', () => {
    expect(isDebugLogging()).toBe(false);
    debugLog('this must not reach the console');
    expect(spy).not.toHaveBeenCalled();
  });

  it('speaks once a host turns it on, and stops when turned off again', () => {
    setDebugLogging(true);
    expect(isDebugLogging()).toBe(true);
    debugLog('now you can hear me');
    expect(spy).toHaveBeenCalledWith('now you can hear me');

    spy.mockClear();
    setDebugLogging(false);
    debugLog('and now you cannot');
    expect(spy).not.toHaveBeenCalled();
  });

  it('the router routes a hard case without saying a word', () => {
    // The concrete regression: routing narrated on every link it touched.
    // A wall of obstacles is the case that used to emit the most.
    const obstacles = Array.from({ length: 8 }, (_, i) => ({
      id: `w${i}`,
      x: 600,
      y: -300 + i * 80,
      width: 80,
      height: 60,
    }));

    const router = new OrthogonalRouter();
    const path = router.route({
      start: { x: 0, y: 30 },
      end: { x: 1200, y: 30 },
      obstacles,
      options: { avoidObstacles: true },
    });

    expect(path).toBeDefined();
    expect(spy).not.toHaveBeenCalled();
  });
});
