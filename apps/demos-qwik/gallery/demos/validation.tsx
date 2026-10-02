import { component$, $, useVisibleTask$ } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { registerConnectionValidator, clearConnectionValidators } from '@grafloria/element';
import { markReady } from '../ready';

const nodes = [
  { id: 'src', position: { x: 80, y: 80 }, size: { width: 120, height: 46 }, label: 'Source', data: { role: 'source' } },
  { id: 'xf', position: { x: 320, y: 80 }, size: { width: 120, height: 46 }, label: 'Transform', data: { role: 'transform' } },
  { id: 'sink', position: { x: 560, y: 80 }, size: { width: 120, height: 46 }, label: 'Sink', data: { role: 'sink' } },
];

/** A typed graph — sources, transforms, sinks — with a registered validator:
 *  nothing flows OUT of a Sink, so a connection whose source is a sink is
 *  refused (with a reason) while the legal ones connect. */
export default component$(() => {
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    clearConnectionValidators();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dispose = registerConnectionValidator(({ sourceNode }: any) => {
      if (sourceNode?.data?.role === 'sink') return 'A Sink has no outputs';
      return true;
    });
    cleanup(() => { (dispose as unknown as (() => void) | undefined)?.(); clearConnectionValidators(); });
  }, { strategy: 'document-ready' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: '8px 24px', font: '12px/1.5 ui-monospace,monospace', opacity: '0.8', borderBottom: '1px solid rgba(127,127,127,.25)' }}>
        validator registered: a Sink may not be a connection source
      </div>
      <div style={{ flex: '1' }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={[]} style={{ height: '100%' }} onInit$={$((instance: DiagramInstance) => {
          instance.getEngine().setInteractionConfig({ portVisibility: 'always' } as never);
          instance.renderNow();
          markReady();
        })} />
      </div>
    </div>
  );
});
