/**
 * A DASHBOARD OWNS ITS CONTAINER GESTURES.
 *
 * Boards, tab groups and pages are diagram groups, and the kit drives every
 * press, drag and drop on them itself — which board a widget lands on, a tab
 * group moved by its strip, a pane torn out at an edge. The diagram's generic
 * group gestures (pick a zone up and drag it; drop a box out of a zone and it
 * leaves) became the defaults, and the generic zone drag grabbed presses the
 * kit owns: eight kit-lab scenarios broke on split boards (L82 … L109). The kit
 * turns the generic ones off where it binds a board.
 */
import { render } from '../grafloria';
import { dashboard } from './dashboard';

describe('a dashboard turns the generic group gestures off for its canvas', () => {
  const mount = (layout: 'grid' | 'split') => {
    const el = document.createElement('div');
    el.style.width = '900px';
    el.style.height = '600px';
    document.body.appendChild(el);
    const api = render(dashboard({ layout, widgets: [{ id: 'a', kind: 'kpi' }, { id: 'b', kind: 'line' }] }) as never, el) as unknown as {
      getEngine(): { getInteractionConfig(): { enableGroupDrag?: boolean; enableGroupMembershipOnDrop?: boolean } };
    };
    return { api, el };
  };

  for (const layout of ['grid', 'split'] as const) {
    it(`${layout} board: no generic zone drag, no generic drop-to-join — the kit's own gestures decide`, () => {
      const { api, el } = mount(layout);
      const config = api.getEngine().getInteractionConfig();
      expect(config.enableGroupDrag).toBe(false);
      expect(config.enableGroupMembershipOnDrop).toBe(false);
      el.remove();
    });
  }
});

describe('disposing the instance disposes the board', () => {
  // The board's tools are process-wide and its listeners sit on the host
  // element, which outlives the instance. Left registered, a disposed board
  // kept claiming presses on the next board mounted in that element: React
  // StrictMode's double mount sent drags to a dead history, made split
  // dividers inert and painted section chrome twice.
  const { listTools } = jest.requireActual('@grafloria/renderer') as typeof import('@grafloria/renderer');
  const dashTools = () => listTools().filter((id) => id.startsWith('dashboard-'));
  for (const layout of ['grid', 'split'] as const) {
    it(`${layout}: instance.dispose() unregisters the board's tools; a re-mount in the same element owns one set`, () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const before = dashTools().length;
      const widgets = [{ id: 'a', kind: 'kpi' }, { id: 'b', kind: 'line' }];
      const first = render(dashboard({ layout, widgets }) as never, el);
      expect(dashTools().length - before).toBe(1);
      first.dispose();
      expect(dashTools().length).toBe(before);
      const second = render(dashboard({ layout, widgets }) as never, el);
      expect(dashTools().length - before).toBe(1);
      second.dispose();
      second.dispose(); // idempotent
      expect(dashTools().length).toBe(before);
      el.remove();
    });
  }
});
