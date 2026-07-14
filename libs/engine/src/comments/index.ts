// Wave 9 (Collaboration) — Card 6: comments, annotations & @mentions.
//
// Threaded comments anchored to a node, a link, or a free region of the canvas. They
// ride the Card 0 op log (see types.ts for the argument), so they converge, replicate,
// persist and undo through machinery that already exists and is already proven.
//
// The three things worth knowing before you read the code:
//
//   1. ANCHOR BY IDENTITY. A thread on a node stores the NODE ID and derives the pin's
//      position from the live node every frame. Move the node and the pin follows, with
//      no op. A free-region thread stores WORLD coordinates, so it survives pan and zoom
//      by construction.
//
//   2. A DELETED NODE DOES NOT DELETE THE CONVERSATION. The thread is ORPHANED — still
//      readable, still replyable, drawn detached at the last place its subject was seen —
//      and `attached` is DERIVED, never stored, so it cannot contradict the diagram, it
//      re-attaches for free on undo, and it is correct no matter which way the CRDT card
//      settles add/remove races. See `CommentStore.resolveAnchor`.
//
//   3. ONE MESSAGE = ONE REGISTER. That is the cut that makes two people's concurrent
//      replies both survive. The obvious `messages: [...]` array would let LWW throw one
//      of them away, silently. There is a test that builds the wrong design and watches
//      it lose the comment.

export * from './types';
export * from './mentions';
export * from './read-state';
export * from './comment-store';
