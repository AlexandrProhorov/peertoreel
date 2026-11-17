import {
  IMPLEMENTATIONS,
  type AffordanceId,
  type ImplementationContract,
} from './catalog.js';

/**
 * Deterministic pre-filter: it does not decide, it narrows the field.
 *
 * The model only ever chooses between viable candidates (or asks to create),
 * so the same affordances always produce the same shortlist — no temperature,
 * no ranking by taste, no scoring without data.
 */
export interface Candidate {
  readonly implementation: ImplementationContract;
  readonly matchedAffordances: readonly AffordanceId[];
}

export const MAX_CANDIDATES = 3;

export function candidatesForAffordances(
  required: readonly AffordanceId[],
  limit = MAX_CANDIDATES,
): Candidate[] {
  const wanted = new Set(required);

  return IMPLEMENTATIONS.map((implementation) => ({
    implementation,
    matchedAffordances: implementation.affordances.filter((affordance) =>
      wanted.has(affordance),
    ),
  }))
    .filter((candidate) => candidate.matchedAffordances.length > 0)
    .sort((left, right) => {
      const byMatches =
        right.matchedAffordances.length - left.matchedAffordances.length;

      return byMatches !== 0
        ? byMatches
        : left.implementation.id.localeCompare(right.implementation.id);
    })
    .slice(0, Math.max(1, limit));
}

/** Affordances no verified implementation covers: these become create requests. */
export function uncoveredAffordances(required: readonly AffordanceId[]): AffordanceId[] {
  return required.filter(
    (affordance) =>
      !IMPLEMENTATIONS.some((implementation) =>
        implementation.affordances.includes(affordance),
      ),
  );
}
