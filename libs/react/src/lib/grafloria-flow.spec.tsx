import { act, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import type { NodeModel } from '@grafloria/engine';
import { renderToStaticSVG } from '@grafloria/renderer';
import type { DiagramInstance, NodeSpec } from '@grafloria/renderer';
import { GrafloriaFlow } from './grafloria-flow';
import type { NodeProps } from './grafloria-flow';
import { GrafloriaProvider } from './context';
import { useGrafloria, useEdgesState, useNodesState, useOnSelectionChange } from './hooks';

const WIDTH = 800;
const HEIGHT = 600;

/**
 * jsdom lays nothing out, so `getBoundingClientRect()` is all zeros and the
 * camera would be a 0×0 canvas. Give every div a real box.
 */
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
});

const NODES: NodeSpec[] = [
  { id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' },
  { id: 'b', position: { x: 400, y: 100 }, size: { width: 120, height: 60 }, label: 'B' },
];

describe('<GrafloriaFlow>', () => {
  it('mounts a real diagram into the DOM', async () => {
    const { container } = render(<GrafloriaFlow defaultNodes={NODES} />);

    await waitFor(() => {
      expect(container.querySelector('svg')).toBeTruthy();
    });
    expect(container.querySelector('[data-vnode-key="node-a"]')).toBeTruthy();
    expect(container.querySelector('[data-vnode-key="node-b"]')).toBeTruthy();
  });

  it('creates the instance exactly ONCE across re-renders', async () => {
    const onInit = jest.fn();
    const { rerender } = render(<GrafloriaFlow defaultNodes={NODES} onInit={onInit} />);
    await waitFor(() => expect(onInit).toHaveBeenCalledTimes(1));

    // New inline callbacks + a new nodes array on every render must NOT tear the
    // instance down — that would throw away the camera and the selection.
    rerender(
      <GrafloriaFlow defaultNodes={[...NODES]} onInit={onInit} onNodesChange={() => undefined} />
    );
    rerender(<GrafloriaFlow defaultNodes={[...NODES]} onInit={onInit} fitView />);

    expect(onInit).toHaveBeenCalledTimes(1);
  });

  it('disposes the instance on unmount', async () => {
    let instance: DiagramInstance | undefined;
    const { unmount, container } = render(
      <GrafloriaFlow defaultNodes={NODES} onInit={(i) => (instance = i)} />
    );
    await waitFor(() => expect(instance).toBeDefined());

    unmount();

    expect(container.querySelector('svg')).toBeNull();
  });

  describe('controlled', () => {
    it('a changed nodes prop reconciles into the live model', async () => {
      let instance: DiagramInstance | undefined;
      const { rerender } = render(
        <GrafloriaFlow nodes={NODES} onInit={(i) => (instance = i)} />
      );
      await waitFor(() => expect(instance).toBeDefined());

      rerender(
        <GrafloriaFlow
          nodes={[...NODES, { id: 'c', position: { x: 600, y: 300 } }]}
          onInit={(i) => (instance = i)}
        />
      );

      await waitFor(() => {
        expect(instance!.getModel().getNodes().map((n) => n.id)).toEqual(['a', 'b', 'c']);
      });
    });

    it('onNodesChange closes the loop when the ENGINE moves a node', async () => {
      const onNodesChange = jest.fn();
      let instance: DiagramInstance | undefined;

      render(
        <GrafloriaFlow
          nodes={NODES}
          onNodesChange={onNodesChange}
          onInit={(i) => (instance = i)}
        />
      );
      await waitFor(() => expect(instance).toBeDefined());
      onNodesChange.mockClear();

      // Simulate what a drag does: the engine mutates the model.
      act(() => {
        instance!.getModel().removeNode('b');
      });

      expect(onNodesChange).toHaveBeenCalled();
      const reported = onNodesChange.mock.calls.at(-1)![0] as NodeModel[];
      expect(reported.map((n) => n.id)).toEqual(['a']);
    });

    it('uncontrolled defaultNodes are owned by the instance', async () => {
      let instance: DiagramInstance | undefined;
      const { rerender } = render(
        <GrafloriaFlow defaultNodes={NODES} onInit={(i) => (instance = i)} />
      );
      await waitFor(() => expect(instance).toBeDefined());

      act(() => {
        instance!.setNodes([...NODES, { id: 'z', position: { x: 0, y: 0 } }]);
      });
      rerender(<GrafloriaFlow defaultNodes={NODES} onInit={(i) => (instance = i)} />);

      // A re-render must NOT snap the uncontrolled model back to the defaults.
      expect(instance!.getModel().getNode('z')).toBeDefined();
    });
  });

  describe('nodeTypes — custom React components as nodes', () => {
    function CardNode({ id, data, selected }: NodeProps<{ title: string }>) {
      return (
        <div data-testid={`card-${id}`} data-selected={selected}>
          {data.title}
        </div>
      );
    }

    it('renders the component INSIDE the core-provided host element', async () => {
      const { container } = render(
        <GrafloriaFlow
          defaultNodes={[
            {
              id: 'n1',
              type: 'card',
              position: { x: 10, y: 20 },
              custom: true,
              data: { title: 'Hello' },
            },
          ]}
          nodeTypes={{ card: CardNode as never }}
        />
      );

      await waitFor(() => expect(screen.getByTestId('card-n1')).toBeTruthy());

      // The portal target is the host element the CORE created and positioned —
      // React never owns the diagram's DOM, only the contents of that one div.
      const host = container.querySelector('[data-node-id="n1"]') as HTMLElement;
      expect(host).toBeTruthy();
      expect(host.getAttribute('style')).toContain('left:10px');
      expect(host.contains(screen.getByTestId('card-n1'))).toBe(true);
    });

    it('reflects selection into the custom component', async () => {
      let instance: DiagramInstance | undefined;
      render(
        <GrafloriaFlow
          defaultNodes={[
            { id: 'n1', type: 'card', position: { x: 0, y: 0 }, custom: true, data: { title: 'x' } },
          ]}
          nodeTypes={{ card: CardNode as never }}
          onInit={(i) => (instance = i)}
        />
      );
      await waitFor(() => expect(screen.getByTestId('card-n1')).toBeTruthy());
      expect(screen.getByTestId('card-n1').dataset['selected']).toBe('false');

      act(() => {
        const model = instance!.getModel();
        model.selectNode(model.getNode('n1')!);
      });

      await waitFor(() =>
        expect(screen.getByTestId('card-n1').dataset['selected']).toBe('true')
      );
    });

    it('unmounts the component when the node is removed', async () => {
      let instance: DiagramInstance | undefined;
      render(
        <GrafloriaFlow
          defaultNodes={[
            { id: 'n1', type: 'card', position: { x: 0, y: 0 }, custom: true, data: { title: 'x' } },
          ]}
          nodeTypes={{ card: CardNode as never }}
          onInit={(i) => (instance = i)}
        />
      );
      await waitFor(() => expect(screen.getByTestId('card-n1')).toBeTruthy());

      act(() => {
        instance!.setNodes([]);
        instance!.renderNow();
      });

      await waitFor(() => expect(screen.queryByTestId('card-n1')).toBeNull());
    });
  });

  describe('SSR + hydration (Card 6)', () => {
    it('hydrates the server SVG without recreating a single DOM node', async () => {
      const ssr = renderToStaticSVG({
        nodes: NODES,
        width: WIDTH,
        height: HEIGHT,
        instanceId: 'grafloria-react-ssr',
      });

      let instance: DiagramInstance | undefined;
      const { container } = render(
        <GrafloriaFlow nodes={NODES} ssr={ssr} onInit={(i) => (instance = i)} />
      );

      // React put the server markup in via dangerouslySetInnerHTML and never
      // touched it; the effect then ADOPTED it.
      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();

      await waitFor(() => expect(instance).toBeDefined());

      expect(instance!.patcher.stats.created).toBe(0);
      expect(instance!.patcher.stats.removed).toBe(0);
      expect(container.querySelector('svg')).toBe(svg); // same element object
    });
  });
});

describe('hooks', () => {
  it('useGrafloria reaches the instance from a SIBLING of the canvas via the provider', async () => {
    function Toolbar() {
      const grafloria = useGrafloria();
      return <div data-testid="toolbar">{grafloria ? 'ready' : 'waiting'}</div>;
    }

    render(
      <GrafloriaProvider>
        <Toolbar />
        <GrafloriaFlow defaultNodes={NODES} />
      </GrafloriaProvider>
    );

    await waitFor(() => expect(screen.getByTestId('toolbar').textContent).toBe('ready'));
  });

  it('useGrafloria works for GrafloriaFlow children with NO provider', async () => {
    function Overlay() {
      const grafloria = useGrafloria();
      return <div data-testid="overlay">{grafloria ? 'ready' : 'waiting'}</div>;
    }

    render(
      <GrafloriaFlow defaultNodes={NODES}>
        <Overlay />
      </GrafloriaFlow>
    );

    await waitFor(() => expect(screen.getByTestId('overlay').textContent).toBe('ready'));
  });

  it('useNodesState / useEdgesState give the React Flow tuple and stay in sync', async () => {
    let instance: DiagramInstance | undefined;

    function App() {
      const [nodes, setNodes, onNodesChange] = useNodesState(NODES);
      const [edges, , onEdgesChange] = useEdgesState([{ id: 'e', source: 'a', target: 'b' }]);

      return (
        <>
          <button
            data-testid="add"
            onClick={() => setNodes((current) => [...current, { id: 'c', position: { x: 9, y: 9 } }])}
          />
          <div data-testid="count">{nodes.length}</div>
          <div data-testid="edges">{edges.length}</div>
          <GrafloriaFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onInit={(i) => (instance = i)}
          />
        </>
      );
    }

    render(<App />);
    await waitFor(() => expect(instance).toBeDefined());
    expect(screen.getByTestId('edges').textContent).toBe('1');

    // setNodes → prop → instance
    act(() => screen.getByTestId('add').click());
    await waitFor(() =>
      expect(instance!.getModel().getNodes().map((n) => n.id)).toEqual(['a', 'b', 'c'])
    );

    // instance → onNodesChange → React state
    act(() => {
      instance!.getModel().removeNode('c');
    });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
  });

  it('useOnSelectionChange fires with the new selection', async () => {
    const seen: string[][] = [];
    let instance: DiagramInstance | undefined;

    function Watcher() {
      useOnSelectionChange(({ nodes }) => seen.push(nodes.map((n) => n.id)));
      return null;
    }

    render(
      <GrafloriaProvider>
        <Watcher />
        <GrafloriaFlow defaultNodes={NODES} onInit={(i) => (instance = i)} />
      </GrafloriaProvider>
    );
    await waitFor(() => expect(instance).toBeDefined());

    act(() => {
      const model = instance!.getModel();
      model.selectNode(model.getNode('b')!);
    });

    expect(seen.at(-1)).toEqual(['b']);
  });

  it('useOnSelectionChange does not re-subscribe on every render (inline arrows are fine)', async () => {
    let instance: DiagramInstance | undefined;
    let renders = 0;

    function Watcher() {
      renders++;
      const [, setTick] = useState(0);
      useOnSelectionChange(() => undefined);
      return <button data-testid="tick" onClick={() => setTick((t) => t + 1)} />;
    }

    render(
      <GrafloriaProvider>
        <Watcher />
        <GrafloriaFlow defaultNodes={NODES} onInit={(i) => (instance = i)} />
      </GrafloriaProvider>
    );
    await waitFor(() => expect(instance).toBeDefined());

    const on = jest.spyOn(instance!, 'on');
    act(() => screen.getByTestId('tick').click());
    act(() => screen.getByTestId('tick').click());

    expect(renders).toBeGreaterThan(1);
    expect(on).not.toHaveBeenCalled(); // the handler ref absorbs the new closure
  });
});
