// rAF frame meter: call __meterStart(), gesture, then __meterStop() → stats.
window.__meterStart = () => {
  const t = [];
  window.__meter = { t, run: true };
  const tick = (now) => { t.push(now); if (window.__meter.run) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};
window.__meterStop = () => {
  window.__meter.run = false;
  const t = window.__meter.t;
  const deltas = [];
  for (let i = 1; i < t.length; i++) deltas.push(t[i] - t[i - 1]);
  deltas.sort((a, b) => a - b);
  const avg = deltas.reduce((s, d) => s + d, 0) / (deltas.length || 1);
  const p95 = deltas[Math.floor(deltas.length * 0.95)] ?? 0;
  return { frames: deltas.length, avgMs: +avg.toFixed(2), p95Ms: +p95.toFixed(2) };
};
