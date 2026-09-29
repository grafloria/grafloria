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
