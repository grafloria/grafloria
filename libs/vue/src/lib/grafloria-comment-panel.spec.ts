/** <GrafloriaCommentPanel> (Vue) — the conversation list bound to a store. */
import { createApp, defineComponent, h } from 'vue';
import { GrafloriaFlow } from './grafloria-flow';
import { GrafloriaCommentPanel } from './grafloria-comment-panel';
import type { NodeSpec } from '@grafloria/renderer';

const flush = () => new Promise((r) => setTimeout(r, 50));

describe('<GrafloriaCommentPanel> (Vue)', () => {
  it('lists a thread, emits selection, and live-hides it on resolve', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let instance: any = null;
    const selections: Array<string | null> = [];
    const app = createApp(
      defineComponent({
        data: () => ({ store: null as any }),
        render() {
          return h('div', [
            h(GrafloriaFlow, {
              defaultNodes: [{ id: 'a', position: { x: 50, y: 50 }, size: { width: 100, height: 50 } }] as NodeSpec[],
              comments: true,
              onInit: (i: any) => { instance = i; this.store = i.getCommentStore(); },
            }),
            this.store
              ? h(GrafloriaCommentPanel, { store: this.store, onSelect: (id: string | null) => selections.push(id) })
              : null,
          ]);
        },
      })
    );
    app.mount(host);
    await flush();
    const store = instance.getCommentStore();
    const threadId = store.createThread({ kind: 'node', id: 'a' }, 'looks wrong');
    await flush();
    expect(host.textContent).toContain('looks wrong');

    (host.querySelector('[role="complementary"] button') as HTMLElement).click();
    expect(selections).toContain(threadId);

    store.resolve(threadId);
    await flush();
    expect(host.textContent).not.toContain('looks wrong');
    app.unmount();
    host.remove();
  });
});
