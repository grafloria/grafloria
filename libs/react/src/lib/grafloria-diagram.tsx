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
 * contract: a spec `render()` mounts in one call.
 */
import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { render as renderSpec, type RenderSpec, type RenderOptions } from '@grafloria/element';
import type { DiagramInstance } from '@grafloria/renderer';

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
    // Mount once per spec identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className={props.className}
      style={{ position: 'relative', ...props.style }}
    />
  );
}
