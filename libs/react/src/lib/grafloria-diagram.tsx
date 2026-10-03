'use client';

/**
 * `<GrafloriaDiagram>` — the generic kit host. Any kit spec renders:
 *
 * ```tsx
 * <GrafloriaDiagram spec={erDiagram({ entities, relationships })}
 *                   onReady={(instance) => …} />
 * ```
 *
 * One component for every present and future kit — every kit speaks the same
 * contract: a spec `render()` mounts in one call. A CHANGED spec (or options)
 * replaces the diagram; an equal one built again on a re-render does not.
 */
import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { render as renderSpec, type RenderSpec, type RenderOptions } from '@grafloria/element';
import type { DiagramInstance } from '@grafloria/renderer';
import { specKey } from './spec-key';

export interface GrafloriaDiagramProps {
  /** Any kit spec — `erDiagram(...)`, `umlDiagram(...)`, `dashboard(...)`, or DSL text. */
  spec: RenderSpec;
  /** Options passed through to the underlying `createDiagram`. */
  options?: RenderOptions;
  onReady?: (instance: DiagramInstance) => void;
  className?: string;
  style?: CSSProperties;
}

export function GrafloriaDiagram(props: GrafloriaDiagramProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const latest = useRef(props);
  latest.current = props;

  // Remount on a change of VALUE: the key is recomputed only when the spec or
  // options object is a new one, and an equal new one keeps the same key.
  const keyed = useRef<{ spec: unknown; options: unknown; key: string } | null>(null);
  if (!keyed.current || keyed.current.spec !== props.spec || keyed.current.options !== props.options) {
    keyed.current = { spec: props.spec, options: props.options, key: specKey(props.spec, props.options) };
  }
  const key = keyed.current.key;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let instance: DiagramInstance | null = renderSpec(
      latest.current.spec,
      container,
      latest.current.options ?? {}
    ) as DiagramInstance;
    latest.current.onReady?.(instance);
    return () => {
      instance?.dispose();
      instance = null;
    };
    // Once per spec VALUE (the latest props are read through the ref).
  }, [key]);

  return (
    <div
      ref={containerRef}
      className={props.className}
      style={{ width: '100%', height: '100%', position: 'relative', ...props.style }}
    />
  );
}
