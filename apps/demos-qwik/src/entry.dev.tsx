/**
 * The CLIENT-ONLY entry, used when the dev server runs with `--mode ssr=false`
 * (`devSsrServer: false`). Kept so the same app can be exercised both ways:
 * SSR + resume is the interesting path, but a plain CSR mount is the one most
 * React/Vue users will compare against.
 */
import { render, type RenderOptions } from '@builder.io/qwik';
import { Root } from './root';

export default function (opts: RenderOptions) {
  return render(document, <Root />, opts);
}
