/**
 * THE DROP POLICY'S ANSWER (`canDrop`), read in ONE place for every hand that
 * asks it: a pointer drag on a grid board, a pointer drag on a split board,
 * and a keyboard move between lists. `false` refuses. A STRING refuses and
 * says why: a screen reader hears the reason and the refused section shows
 * it. Anything else takes the tile, as `true` and no policy always have.
 */

/** What a drop policy may answer: take the tile (`true`), refuse it (`false`), or refuse it with a reason. */
export type DropAnswer = boolean | string;

/** The refusal in an answer: null when the board takes the tile, else the reason ('' when none was given). */
export function refusalOf(answer: unknown): string | null {
  if (typeof answer === 'string') return answer.trim();
  return answer === false ? '' : null;
}

/**
 * The refusal for board `to`, asked once per board per gesture (the page's
 * state cannot change mid-drag) and kept in `verdicts`.
 */
export function refusalFor(verdicts: Map<string, string | null>, to: string, ask: () => unknown): string | null {
  if (!verdicts.has(to)) verdicts.set(to, refusalOf(ask()));
  return verdicts.get(to) ?? null;
}

/**
 * The reason a LIST gives when it has no room for the card: a list of fixed
 * height (`sizing: 'fit'`) at its last row. It refuses as the drop policy
 * does, and is said and shown the same way.
 */
export const LIST_FULL = 'This list is full';

/** "In progress refuses it: WIP limit of 3 reached" — a refusal as a person hears it; without a reason, the board's name and "refuses". */
export function refusalSentence(board: string, what: string, reason: string): string {
  return reason ? `${board} refuses ${what}: ${reason}` : `${board} refuses ${what}`;
}
