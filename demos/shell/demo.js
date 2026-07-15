// The demo contract.
//
// Every page in this gallery declares itself through `defineDemo()`. That gives us three
// things at once, and the third is the one that matters:
//
//   1. a consistent page shell (title, description, source link) with no framework;
//   2. a mounted diagram, driven through the SAME public entry point an embedder uses —
//      so if the public API is broken, the gallery is broken, which is the point;
//   3. AN ASSERTION THE HARNESS CAN RUN. `assert()` executes IN THE PAGE, drives the
//      feature with real events, and throws if it did not work.
//
// That third one is why this gallery exists. A unit test proves a unit works; it never
// proves anything CALLS it. This project has shipped, in every single wave, elaborate
// machinery that was wired to nothing and fully green: a layout service nothing called, 17
// LOD presets that were all no-ops, a worker stack whose tests all forced it off, an entire
// touch stack in the public API that was unwireable. A demo you can drive in a browser is
// the only artefact that proves REACHABILITY.
//
// So a broken demo is a red gate. See demos/e2e/gallery-run.mjs.

/**
 * @typedef {Object} DemoSpec
 * @property {string} name         Short title.
 * @property {string} blurb        One line: what this proves.
 * @property {string} [reactflow]  The equivalent reactflow.dev example, if there is one.
 * @property {boolean} [pro]       True when React Flow puts the equivalent behind its paywall.
 * @property {(ctx: DemoContext) => void|Promise<void>} setup   Build the diagram.
 * @property {(ctx: DemoContext) => void|Promise<void>} assert  Drive it. THROW if it failed.
 */

/**
 * @typedef {Object} DemoContext
 * @property {HTMLElement} host        The mount point.
 * @property {any} engine
 * @property {any} diagram
 * @property {any} instance           Whatever the public entry point returned.
 * @property {(ms?: number) => Promise<void>} tick   Let a frame (or n ms) pass.
 */

const failures = [];

/** Assert, with a message that will actually help whoever sees it go red at 3am. */
export function check(condition, message) {
  if (!condition) {
    const err = new Error(message);
    failures.push(message);
    throw err;
  }
}

/** Assert two things are equal, printing both — a bare `false` teaches nobody anything. */
export function checkEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(a === e, `${message}\n    expected: ${e}\n    actual:   ${a}`);
}

/** Assert a number moved. The commonest real assertion, and the commonest place to be vague. */
export function checkChanged(before, after, message) {
  check(
    JSON.stringify(before) !== JSON.stringify(after),
    `${message}\n    it did not change: still ${JSON.stringify(before)}`
  );
}

export function defineDemo(spec) {
  const boot = async () => {
    const host = document.getElementById('canvas');
    const ctx = {
      host,
      tick: (ms = 0) =>
        new Promise((r) => requestAnimationFrame(() => (ms ? setTimeout(r, ms) : r()))),
    };

    // Header. Written by the shell so every page carries the same claim in the same place —
    // including, honestly, whether the equivalent is paid over at React Flow.
    const head = document.getElementById('demo-head');
    if (head) {
      head.innerHTML = `
        <h1>${escapeHtml(spec.name)}</h1>
        <p class="blurb">${escapeHtml(spec.blurb)}</p>
        ${
          spec.reactflow
            ? `<p class="rf">React Flow equivalent: <code>${escapeHtml(spec.reactflow)}</code>${
                spec.pro
                  ? ' <span class="pro" title="React Flow puts this behind its paywall">Pro — paid</span>'
                  : ''
              }</p>`
            : ''
        }`;
    }

    await spec.setup(ctx);

    // THE HANDLE THE HARNESS PULLS. Exposed on window so Playwright can call it in-page —
    // the assertion must run where the DOM, the events and the renderer actually are, not in
    // Node against a mock.
    window.__demo = {
      name: spec.name,
      reactflow: spec.reactflow ?? null,
      pro: !!spec.pro,
      run: async () => {
        failures.length = 0;
        await spec.assert(ctx);
        return { ok: failures.length === 0, failures: [...failures] };
      },
    };
    // Debug seam: probes (fit checks, screenshot tooling) reach the live
    // instance without each demo having to export it.
    window.__demoCtx = ctx;
    window.__demoReady = true;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}
