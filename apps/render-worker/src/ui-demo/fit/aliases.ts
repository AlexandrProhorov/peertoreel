import { PRIMITIVES, type PrimitiveId } from '../catalog.js';

/**
 * Aliases are evidence, not generosity.
 *
 * Every rule here is a name the model actually wrote in archived attempts, and
 * each one is narrow enough to be safe: a typo inside a declared parameter, or a
 * state written as a parameter. Anything broader turns into a promise to keep
 * accepting a wrong name forever.
 *
 * Census (2026-11-20, 28 runs): `pill.text_` ×1, `pill.active` ×1,
 * `bubble.padding` ×3, `card.tone` ×2, `pill.side` ×2 — the last three are
 * mix-ups (the parameter exists on another primitive) and stay dropped with a
 * reason that says so.
 */

export interface ParameterAlias {
  /** `*` when the typo is the same for every primitive that takes the target. */
  readonly primitive: PrimitiveId | '*';
  readonly from: string;
  readonly to: string;
  readonly evidence: string;
}

export const PARAMETER_ALIASES: readonly ParameterAlias[] = [
  {
    primitive: '*',
    from: 'text_',
    to: 'text',
    evidence: 'pill.text_ ×1: yaml-style typo',
  },
];

export interface StateAlias {
  readonly primitive: PrimitiveId;
  readonly from: string;
  readonly state: string;
  readonly evidence: string;
}

const STATE_ALIASES: readonly StateAlias[] = [
  {
    primitive: 'pill',
    from: 'active',
    state: 'active',
    evidence: 'pill.active ×1: a state written as a parameter',
  },
];

/** The declared parameter this typo should have been, when the primitive takes it. */
export function aliasedParameter(primitive: PrimitiveId, key: string): string | null {
  const rule = PARAMETER_ALIASES.find(
    (item) => item.from === key && (item.primitive === '*' || item.primitive === primitive),
  );

  if (rule === undefined || !Object.hasOwn(PRIMITIVES[primitive].parameters, rule.to)) {
    return null;
  }

  return rule.to;
}

/** The state this parameter was meant to be, when the primitive declares it. */
export function aliasedState(primitive: PrimitiveId, key: string): string | null {
  const rule = STATE_ALIASES.find((item) => item.primitive === primitive && item.from === key);

  if (rule === undefined || !PRIMITIVES[primitive].states.includes(rule.state)) {
    return null;
  }

  return rule.state;
}

/** Does some other primitive declare this parameter? A mix-up, not a typo. */
export function parameterBelongsToAnother(primitive: PrimitiveId, key: string): boolean {
  return (Object.keys(PRIMITIVES) as PrimitiveId[]).some(
    (candidate) =>
      candidate !== primitive && Object.hasOwn(PRIMITIVES[candidate].parameters, key),
  );
}

/**
 * The model writes `move` or `scale` where an animation name belongs: those are
 * operations the element performs, not transitions the timeline plays. The name
 * still has to be dropped, but the reason should say what happened.
 */
export function transitionIsOperation(primitive: PrimitiveId, transition: string): boolean {
  const contract = PRIMITIVES[primitive];

  return (
    contract.operations.includes(transition) && !contract.transitions.includes(transition)
  );
}
