/**
 * Paint order: what covers what.
 *
 * Element order in the spec is the model's placement, not a layering decision.
 * A grid is a background pattern and must never sit on top of a card, and text
 * must stay readable on top of everything — otherwise a correctly positioned
 * "Подписка" disappears under a grid that was listed after it.
 *
 * Within one rank the author's order is preserved, so a collage keeps its own
 * stacking.
 */

const RANK: Readonly<Record<string, number>> = {
  stage: 0,
  grid: 1,
  card: 2,
  /* A line is a divider or a connector: inside a card it must sit on top of it,
     otherwise it hides under the surface and only its overflow shows. */
  line: 3,
  avatar: 3,
  object: 3,
  track: 4,
  thumb: 4,
  pill: 5,
  bubble: 6,
  label: 7,
};

const DEFAULT_RANK = 3;

export function paintOrder<T extends { readonly primitive: string }>(
  elements: readonly T[],
): T[] {
  return [...elements].sort(
    (left, right) =>
      (RANK[left.primitive] ?? DEFAULT_RANK) - (RANK[right.primitive] ?? DEFAULT_RANK),
  );
}
