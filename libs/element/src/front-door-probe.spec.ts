/**
 * THE FRONT-DOOR COMPILE PROBE.
 *
 * The audit that motivated Phase 0 wrote a file importing ONLY `@grafloria/element`
 * and put 20 `@ts-expect-error` markers on 20 capability names, expecting some
 * of them to be wrong. The probe exited 0: ALL TWENTY were genuine errors. An
 * embedder could not so much as NAME `DiagramEngine`, `NodeModel`, `Command` or
 * `CommandManager` through the package they install.
 *
 * This file is that probe inverted, and kept. It imports only `@grafloria/element`
 * — never `@grafloria/engine`, never `@grafloria/renderer`, which is the whole point,
 * since an embedder has only the one dependency — and uses each name in BOTH
 * positions that matter:
 *
 *   - as a TYPE (can I declare a variable to hold one?), and
 *   - as a VALUE (can I construct or call it?).
 *
 * The type half is enforced by the compiler at test time, not by an assertion;
 * if a name stops being reachable AS A TYPE this file stops compiling, which is
 * a louder failure than a red assertion and cannot be skipped.
 *
 * `reachability.spec.ts` sweeps the whole surface generically. This file is the
 * narrow, human-readable counter-example: the exact 20 the audit named, plus
 * the undo stack, spelled out so the regression is legible in a diff.
 */
import {
  Grafloria,
  render,
  // The 20 the audit could not name.
  DiagramEngine,
  DiagramModel,
  NodeModel,
  LinkModel,
  PortModel,
  Command,
  CommandManager,
  EventBus,
  RoutingEngine,
  LayoutRegistry,
  PluginManager,
  createDiagram,
  createExtensionHost,
  registerDiagramMigration,
  validateSerializedDiagram,
  DiagramOutlineView,
  DSL,
  SwimlaneService,
  ClipboardManager,
  SelectionManager,
  // The undo stack — an app cannot make a single reversible edit without these.
  AddNodeCommand,
  MoveNodeCommand,
  ResizeNodeCommand,
  BatchCommand,
} from './index';

describe('the front door compiles: an embedder with ONE dependency can name the machinery', () => {
  it('names every capability the audit found unnameable, as a TYPE', () => {
    // These declarations are the assertion. If any name is not reachable as a
    // type, this file fails to COMPILE and the suite never runs — which is the
    // failure mode we want, because it cannot be ignored.
    type _Engine = DiagramEngine;
    type _Model = DiagramModel;
    type _Node = NodeModel;
    type _Link = LinkModel;
    type _Port = PortModel;
    type _Cmd = Command;
    type _Mgr = CommandManager;
    type _Bus = EventBus;
    type _Routing = RoutingEngine;
    type _Layouts = LayoutRegistry;
    type _Plugins = PluginManager;
    type _Outline = DiagramOutlineView;
    type _Dsl = DSL;
    type _Swimlane = SwimlaneService;
    type _Clip = ClipboardManager;
    type _Sel = SelectionManager;
    type _Add = AddNodeCommand;
    type _Move = MoveNodeCommand;
    type _Resize = ResizeNodeCommand;
    type _Batch = BatchCommand;

    // Reference them so `noUnusedLocals` cannot quietly delete the proof.
    const witness: Array<unknown> = [
      null as unknown as _Engine,
      null as unknown as _Model,
      null as unknown as _Node,
      null as unknown as _Link,
      null as unknown as _Port,
      null as unknown as _Cmd,
      null as unknown as _Mgr,
      null as unknown as _Bus,
      null as unknown as _Routing,
      null as unknown as _Layouts,
      null as unknown as _Plugins,
      null as unknown as _Outline,
      null as unknown as _Dsl,
      null as unknown as _Swimlane,
      null as unknown as _Clip,
      null as unknown as _Sel,
      null as unknown as _Add,
      null as unknown as _Move,
      null as unknown as _Resize,
      null as unknown as _Batch,
    ];
    expect(witness).toHaveLength(20);
  });

  it('names them as VALUES too — a type you cannot construct is not a capability', () => {
    for (const ctor of [
      DiagramEngine,
      DiagramModel,
      NodeModel,
      LinkModel,
      PortModel,
      Command,
      CommandManager,
      EventBus,
      RoutingEngine,
      LayoutRegistry,
      PluginManager,
      DiagramOutlineView,
      DSL,
      SwimlaneService,
      ClipboardManager,
      SelectionManager,
      AddNodeCommand,
      MoveNodeCommand,
      ResizeNodeCommand,
      BatchCommand,
      createDiagram,
      createExtensionHost,
      registerDiagramMigration,
      validateSerializedDiagram,
    ]) {
      expect(typeof ctor).toBe('function');
    }
  });

  it('actually DRIVES the machinery through the front door alone', async () => {
    // Not a smoke test of exports — a real, if tiny, use of the surface: build a
    // model, mutate it through an UNDOABLE command, and undo. This is the
    // workflow that was impossible from `@grafloria/element` before Phase 0, and it
    // is the workflow every builder-style app (dashboard, workflow, ERD) is made
    // of. Note the imports: nothing here reaches past the embed package.
    const model = new DiagramModel('probe');
    const bus = new EventBus();
    const manager = new CommandManager({ diagram: model, eventBus: bus });

    const node = new NodeModel({
      id: 'probe-1',
      type: 'rectangle',
      position: { x: 10, y: 20 },
      size: { width: 100, height: 40 },
    });

    await manager.execute(new AddNodeCommand(node));
    expect(model.getNodes().length).toBe(1);

    await manager.execute(new MoveNodeCommand('probe-1', { x: 200, y: 300 }));
    expect(model.getNode('probe-1')?.position).toEqual({ x: 200, y: 300 });

    await manager.undo();
    expect(model.getNode('probe-1')?.position).toEqual({ x: 10, y: 20 });

    await manager.undo();
    expect(model.getNodes().length).toBe(0);

    // And the one-call API still works from the same import, unchanged.
    expect(typeof render).toBe('function');
    expect(typeof Grafloria.render).toBe('function');
  });
});
