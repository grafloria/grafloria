export function markReady(): void {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    (window as unknown as { __reactDemoReady?: boolean }).__reactDemoReady = true;
  }));
}
