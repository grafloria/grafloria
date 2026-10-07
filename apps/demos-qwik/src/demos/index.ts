import type { Component } from '@builder.io/qwik';
import AutoLayout from './auto-layout';
import CustomNodes from './custom-nodes';
import EditorChrome from './editor-chrome';
import HelloFlow from './hello-flow';
import SpecSwap from './spec-swap';
import SsrResumable from './ssr-resumable';
import ToolbarAndHooks from './toolbar-and-hooks';
import ZonesAndHighlight from './zones-and-highlight';

export interface DemoEntry {
  slug: string;
  title: string;
  blurb: string;
  component: Component<Record<string, never>>;
}

/**
 * Statically imported on purpose: the shell is server-rendered per request and
 * each demo is a separate `component$`, so Qwik still only downloads the
 * segments the page you asked for actually needs.
 */
export const DEMOS: DemoEntry[] = [
  {
    slug: 'hello-flow',
    title: 'Hello flow',
    blurb: 'Plain data in, a live canvas out.',
    component: HelloFlow,
  },
  {
    slug: 'editor-chrome',
    title: 'Minimap & controls',
    blurb: 'Editor chrome from one `plugins` prop.',
    component: EditorChrome,
  },
  {
    slug: 'auto-layout',
    title: 'Auto layout',
    blurb: 'Declarative dagre layout, tracked by value.',
    component: AutoLayout,
  },
  {
    slug: 'custom-nodes',
    title: 'Custom nodes',
    blurb: 'Qwik components rendered into the HTML layer.',
    component: CustomNodes,
  },
  {
    slug: 'toolbar-and-hooks',
    title: 'Toolbar & hooks',
    blurb: 'Provider, selection, viewport — QRL handlers.',
    component: ToolbarAndHooks,
  },
  {
    slug: 'zones-and-highlight',
    title: 'Zones & highlight',
    blurb: '`groups` and `highlightConnected`, followed live.',
    component: ZonesAndHighlight,
  },
  {
    slug: 'spec-swap',
    title: 'Spec swap',
    blurb: '`<GrafloriaDiagram>` follows its spec by value.',
    component: SpecSwap,
  },
  {
    slug: 'ssr-resumable',
    title: 'SSR + resume',
    blurb: 'Server-rendered SVG the client adopts.',
    component: SsrResumable,
  },
];

export const DEFAULT_DEMO = DEMOS[0].slug;

export function findDemo(slug: string | null | undefined): DemoEntry {
  return DEMOS.find((d) => d.slug === slug) ?? DEMOS[0];
}
