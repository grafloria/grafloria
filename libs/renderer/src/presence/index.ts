// Wave 9 (Collaboration) — Card 5, Part B: LIVE PRESENCE.
//
// Remote cursors, remote selections and name badges, as a SEPARATE DOM LAYER that never
// enters the VNode tree — so a cursor at 60fps cannot dirty a 10,000-node diagram's frame,
// and an idle canvas with presence mounted still costs 0.0ms. See `presence-overlay.ts` for
// why `invalidateFrame()` is the obvious fix and the wrong one.

export {
  PresenceOverlay,
  PRESENCE_LAYER_CLASS,
  actorColor,
  actorInitials,
  contrastingTextColor,
} from './presence-overlay';
export type { PresencePeer, PresenceOverlayOptions, BoundsLookup } from './presence-overlay';

export { bindPresence } from './bind-presence';
export type { PresenceSource, PresenceBinding, BindPresenceOptions } from './bind-presence';
