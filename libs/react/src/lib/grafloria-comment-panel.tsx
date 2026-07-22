'use client';

/**
 * `<GrafloriaCommentPanel>` — the conversation UI for a comment store.
 *
 * ```tsx
 * const grafloria = useGrafloria();
 * <GrafloriaCommentPanel store={grafloria!.getCommentStore()!} onSelect={focus} />
 * ```
 */
import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { CommentStore } from '@grafloria/engine';
import { CommentPanelView, type CommentPanelOptions } from '@grafloria/renderer';

export interface GrafloriaCommentPanelProps {
  store: CommentStore;
  options?: CommentPanelOptions;
  onSelect?: (threadId: string | null) => void;
  className?: string;
  style?: CSSProperties;
}

export function GrafloriaCommentPanel(props: GrafloriaCommentPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const panel = new CommentPanelView(container, latest.current.store, {
      ...latest.current.options,
      onSelect: (threadId) => {
        latest.current.options?.onSelect?.(threadId);
        latest.current.onSelect?.(threadId);
      },
    });
    const off = latest.current.store.onChange(() => panel.update());
    return () => {
      off();
      panel.dispose();
    };
    // The panel binds to ONE store for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className={props.className} style={props.style} />;
}
