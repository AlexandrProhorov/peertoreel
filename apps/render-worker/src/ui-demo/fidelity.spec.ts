import { describe, expect, it } from 'vitest';
import { BEHAVIORS, behaviorById, primitiveBehaviors } from './behaviors.js';
import { IMPLEMENTATIONS } from './catalog.js';
import { explainFidelity, resolveFidelity } from './fidelity.js';

describe('behaviour registry', () => {
  it('has unique ids and a meaning for each behaviour', () => {
    const ids = BEHAVIORS.map((behavior) => behavior.id);

    expect(new Set(ids).size).toBe(ids.length);

    for (const behavior of BEHAVIORS) {
      expect(behavior.meaning.length).toBeGreaterThan(0);
      expect(behavior.operations.length).toBeGreaterThan(0);
    }
  });

  it('only references behaviours that exist', () => {
    for (const implementation of IMPLEMENTATIONS) {
      for (const behavior of implementation.behaviors) {
        expect(behaviorById(behavior), `${implementation.id} -> ${behavior}`).not.toBeNull();
      }
    }
  });

  it('keeps primitive coverage honest: no primitive promises an unimplemented behaviour', () => {
    const primitives = primitiveBehaviors();

    expect(primitives.has('draw-progressively')).toBe(true);
    expect(primitives.has('fill-progressively')).toBe(true);
    expect(primitives.has('type-on')).toBe(true);
    expect(primitives.has('terminate-abruptly')).toBe(false);
    expect(primitives.has('feed-scroll')).toBe(false);
    expect(primitives.has('drop-settle')).toBe(false);
  });
});

describe('fidelity resolution', () => {
  it('reuses an implementation only when it preserves every behaviour', () => {
    const result = resolveFidelity(['move-along-scale', 'terminate-abruptly']);

    expect(result.decision).toBe('reuse');
    expect(result.implementationId).toBe('scale-break');
    expect(result.uncovered).toEqual([]);
  });

  it('composes when the primitives cover every behaviour', () => {
    expect(resolveFidelity(['draw-progressively', 'fill-progressively'])).toEqual({
      decision: 'compose',
      implementationId: null,
      uncovered: [],
      silentDowngrade: false,
    });
  });

  it('creates when at least one behaviour has no implementation', () => {
    const result = resolveFidelity(['feed-scroll']);

    expect(result.decision).toBe('create');
    expect(result.uncovered).toEqual(['feed-scroll']);
  });

  it('does not accept partial coverage as reuse or compose', () => {
    const result = resolveFidelity(['type-on', 'terminate-abruptly']);

    expect(result.decision).toBe('create');
    /* prompt-card covers type-on, scale-break covers terminate-abruptly: each
       candidate is partial, so the answer is create. */
    expect(result.silentDowngrade).toBe(true);
    expect(result.uncovered).toEqual(['terminate-abruptly']);
  });

  it('treats an empty requirement set as not resolvable', () => {
    expect(resolveFidelity([]).decision).toBe('create');
  });

  it('is deterministic', () => {
    const first = resolveFidelity(['appear-fade', 'type-on']);
    const second = resolveFidelity(['type-on', 'appear-fade']);

    expect(first).toEqual(second);
  });

  it('explains a failure by the missing meaning, not by an id', () => {
    const result = resolveFidelity(['count-up']);
    const text = explainFidelity(result);

    expect(text).toContain('число растёт');
  });
});
