/**
 * The SERVER entry. Vite's Qwik dev server calls this for every page request,
 * so every demo below is genuinely server-rendered first and resumed in the
 * browser — no client-only mount, no hydration pass.
 */
import { renderToStream, type RenderToStreamOptions } from '@builder.io/qwik/server';
import { Root } from './root';

export default function render(opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    ...opts,
    containerAttributes: { lang: 'en', ...opts.containerAttributes },
  });
}
