/// <reference lib="webworker" />
// A real module Worker whose body is serveLayout(self) — the same message loop
// the inline host runs. engine.setLayoutPort(worker) routes engine.layout()
// through this thread, so a force layout never blocks the main thread.
import { serveLayout, type LayoutServePort } from '@grafloria/engine';

serveLayout(self as unknown as LayoutServePort);
