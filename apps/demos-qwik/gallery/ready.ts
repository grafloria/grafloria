/** Tell the gallery (and CI) the demo has painted: two frames after it settles. */
export function markReady(): void {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    (window as unknown as { __qwikDemoReady?: boolean }).__qwikDemoReady = true;
  }));
}
