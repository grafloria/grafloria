/**
 * A zone is a container you can pick up.
 *
 * Grabbing a group's frame used to fall through to "empty canvas → pan" (the
 * whole diagram slid) and a box dragged out of a zone stayed its member: both
 * gestures were opt-in, so a diagram that declared zones had neither unless its
 * host knew the two flag names. They are the defaults now.
 */
import { DEFAULT_INTERACTION_CONFIG } from './InteractionConfig';

describe('group gestures are on by default', () => {
  it('pressing a zone and dragging moves the zone with everything in it', () => {
    expect(DEFAULT_INTERACTION_CONFIG.enableGroupDrag).toBe(true);
  });

  it('dropping a box outside its zone takes it out; dropping it inside one puts it in', () => {
    expect(DEFAULT_INTERACTION_CONFIG.enableGroupMembershipOnDrop).toBe(true);
  });
});
