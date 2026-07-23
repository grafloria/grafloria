export function markReady(): void {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    (window as unknown as { __vueDemoReady?: boolean }).__vueDemoReady = true;
  }));
}
