/**
 * The instance's `copy()` / `cut()` / `paste()`, and the `clipboard` hooks that
 * let a host keep its own format beside the diagram's.
 *
 * The diagram's clipboard stays the engine's in-memory one (`ClipboardData`,
 * plain JSON). `onCopy` hands that payload to the host after every copy or cut —
 * to write to the system clipboard next to the host's own JSON — and `onPaste`
 * may hand one back before a paste (read from wherever the host keeps it).
 */
import type { ClipboardData, DiagramEngine, LinkModel, NodeModel, Point } from '@grafloria/engine';

export interface ClipboardHooks {
  /** After a copy or a cut: the diagram's payload, to keep wherever the host keeps its clipboard. */
  onCopy?(data: ClipboardData, kind: 'copy' | 'cut'): void;
  /**
   * Before a paste: a payload to paste instead of the last copy (read back from
   * the system clipboard, say). Undefined pastes the last copy.
   */
  onPaste?(): ClipboardData | undefined | Promise<ClipboardData | undefined>;
}

export interface PasteOptions {
  offset?: Point;
  selectPasted?: boolean;
}

export interface ClipboardApi {
  copy(): Promise<ClipboardData | null>;
  cut(): Promise<ClipboardData | null>;
  paste(data?: ClipboardData, options?: PasteOptions): Promise<boolean>;
}

export function createClipboardApi(
  engine: DiagramEngine,
  hooks: ClipboardHooks | undefined,
  after: { changed(): void; isReadonly(): boolean }
): ClipboardApi {
  const selection = (): { nodes: NodeModel[]; link?: LinkModel } => {
    const diagram = engine.getDiagram();
    if (!diagram) return { nodes: [] };
    return {
      nodes: diagram.getSelectedNodes(),
      link: diagram.getLinks().find((l: LinkModel) => l.state === 'selected'),
    };
  };

  const copy = async (kind: 'copy' | 'cut'): Promise<ClipboardData | null> => {
    if (!engine.getDiagram() || selection().nodes.length === 0) return null;
    await engine.copy();
    const data = engine.getClipboardData();
    if (data) hooks?.onCopy?.(data, kind);
    return data;
  };

  return {
    copy: () => copy('copy'),

    /** Copy, then delete the selection as ONE undo step. Refused while read-only. */
    async cut() {
      if (after.isReadonly()) return null;
      const { nodes, link } = selection();
      const data = await copy('cut');
      if (!data) return null;
      const cm = engine.commandManager;
      cm.beginBatch();
      try {
        if (link) await engine.removeLink(link.id);
        for (const node of nodes) await engine.removeNode(node.id);
      } finally {
        await cm.endBatch('Cut');
      }
      after.changed();
      return data;
    },

    /** Paste `data` (or what `onPaste` answers, or the last copy). False when there was nothing to paste. */
    async paste(data, options) {
      if (after.isReadonly() || !engine.getDiagram()) return false;
      const payload = data ?? (await hooks?.onPaste?.());
      if (payload) engine.clipboardManager.set(payload);
      if (!engine.hasClipboardData()) return false;
      await engine.paste(options);
      after.changed();
      return true;
    },
  };
}
