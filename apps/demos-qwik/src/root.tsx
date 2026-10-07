import { component$, useServerData } from '@builder.io/qwik';
import { DEMOS, findDemo } from './demos';
import { SHELL_CSS } from './shell-css';

/**
 * The gallery shell. Navigation is plain `<a href="?demo=…">`, so every demo
 * is a fresh SERVER render — which is exactly what should be exercised here.
 *
 * Note there is no `<html>` here: Qwik owns the container element (it needs to
 * stamp the resumability attributes on it), so a root component contributes
 * `<head>` and `<body>` and nothing above them.
 */
export const Root = component$(() => {
  // The Qwik dev/SSR server puts the request URL in server data. It is a
  // string, so it serializes and the resumed page sees the same value.
  const url = useServerData<string>('url', 'http://localhost/');
  const slug = new URL(url).searchParams.get('demo');
  const demo = findDemo(slug);
  const Demo = demo.component;

  return (
    <>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>Grafloria — Qwik demos</title>
        <style dangerouslySetInnerHTML={SHELL_CSS} />
      </head>
      <body>
        <aside class="sidebar">
          <h1>
            Grafloria <span>@grafloria/qwik</span>
          </h1>
          <nav>
            {DEMOS.map((entry) => (
              <a
                key={entry.slug}
                href={`?demo=${entry.slug}`}
                class={entry.slug === demo.slug ? 'active' : ''}
              >
                <strong>{entry.title}</strong>
                <em>{entry.blurb}</em>
              </a>
            ))}
          </nav>
          <p class="note">
            Server-rendered by Vite's Qwik dev server, then resumed. No hydration pass.
          </p>
        </aside>
        <main class="stage">
          <Demo />
        </main>
      </body>
    </>
  );
});
