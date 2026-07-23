/** The e2e gate polls this exactly like the JS gallery's __demoReady. */
export function markReady(): void {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    (window as unknown as { __ngDemoReady?: boolean }).__ngDemoReady = true;
  }));
}
