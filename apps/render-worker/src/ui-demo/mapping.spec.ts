import { describe, expect, it } from 'vitest';
import {
  resolveMapping,
  type BehaviorMatch,
} from './fidelity.js';
import { behaviorById } from './behaviors.js';

function known(
  behaviorId: string,
  overrides: Partial<Extract<BehaviorMatch, { kind: 'known' }>> = {},
): BehaviorMatch {
  const behavior = behaviorById(behaviorId);

  if (behavior === null) {
    throw new Error(`test asks for unknown behaviour ${behaviorId}`);
  }

  return {
    kind: 'known',
    behaviorId,
    signature: behavior.signature,
    requiredActions: behavior.operations.map((operation) => ({
      operation,
      target: 'grid',
    })),
    evidence: [{ quote: 'концепт', supports: 'action' }],
    why: 'тест',
    ...overrides,
  };
}

function proposed(
  overrides: Partial<Extract<BehaviorMatch, { kind: 'proposed' }>> = {},
): BehaviorMatch {
  const base = behaviorById('fill-progressively');

  if (base === null) {
    throw new Error('registry is broken');
  }

  return {
    kind: 'proposed',
    proposed: 'mask-conceal',
    meaning: 'существующий текст перекрывается маской',
    signature: {
      target: 'existing-text',
      initialState: 'visible',
      action: 'occlude',
      progression: 'left-to-right',
      finalState: 'hidden',
    },
    semanticDifference: {
      comparedTo: 'fill-progressively',
      dimension: 'target',
      existing: 'пустая область',
      required: 'существующий текст',
    },
    requiredActions: [{ operation: 'occlude', target: 'text' }],
    why: 'тест',
    ...overrides,
  };
}

describe('semantic mapping: known behaviours', () => {
  it('maps fill-grid to fill-progressively and composes', () => {
    const result = resolveMapping('b8', known('fill-progressively'));

    expect(result.identity).toBe('known');
    expect(result.finalResolution).toBe('compose');
    expect(result.signatureIssues).toEqual([]);
  });

  it('maps drag-slider to drag-along-track', () => {
    const result = resolveMapping('b4', known('drag-along-track'));

    expect(result.finalResolution).toBe('compose');
  });

  it('maps connect-points to draw-progressively and reuses scale-break', () => {
    const result = resolveMapping('b5', known('draw-progressively'));

    expect(result.finalResolution).toBe('reuse');
    expect(result.implementationId).toBe('scale-break');
  });

  it('maps terminate-abruptly to the known behaviour and reuses scale-break', () => {
    const result = resolveMapping('b9', known('terminate-abruptly'));

    expect(result.finalResolution).toBe('reuse');
    expect(result.implementationId).toBe('scale-break');
  });

  it('rejects a mapping whose evidence quote is not in the concept', () => {
    const match = known('fill-progressively', {
      evidence: [{ quote: 'сетка заполняется', supports: 'action' }],
    });
    const result = resolveMapping('b8', match, {
      conceptText: 'лента прокручивается, счётчик растёт',
    });

    expect(result.finalResolution).toBe('create');
    expect(result.evidenceIssues[0]).toContain('quote not found');
  });

  it('accepts a mapping whose evidence quote is in the concept', () => {
    const match = known('fill-progressively', {
      evidence: [{ quote: 'сетка заполняется', supports: 'action' }],
    });
    const result = resolveMapping('b8', match, {
      conceptText: 'Сетка заполняется реакцией, пока не станет почти полной.',
    });

    expect(result.evidenceIssues).toEqual([]);
    expect(result.finalResolution).toBe('compose');
  });

  it('rejects a known behaviour when the signature does not match', () => {
    const match = known('fill-progressively', {
      signature: {
        target: 'existing-text',
        initialState: 'visible',
        action: 'occlude',
        progression: 'left-to-right',
        finalState: 'hidden',
      },
    });
    const result = resolveMapping('b8', match);

    expect(result.finalResolution).toBe('create');
    expect(result.signatureIssues[0]).toContain('signature differs');
  });

  it('rejects a known behaviour when the operations do not belong to it', () => {
    const match = known('fill-progressively', {
      requiredActions: [{ operation: 'occlude', target: 'text' }],
    });
    const result = resolveMapping('b8', match);

    expect(result.finalResolution).toBe('create');
    expect(result.operationIssues[0]).toContain('is not part of');
  });

  it('rejects an unknown behaviour id', () => {
    const result = resolveMapping('b8', {
      kind: 'known',
      behaviorId: 'fill-grid',
      signature: {
        target: 'empty-area',
        initialState: 'absent',
        action: 'fill',
        progression: 'sequential',
        finalState: 'filled',
      },
      requiredActions: [{ operation: 'fill', target: 'grid' }],
      evidence: [{ quote: 'переименование', supports: 'action' }],
      why: 'переименование',
    });

    expect(result.finalResolution).toBe('create');
    expect(result.signatureIssues[0]).toContain('unknown behaviour');
  });
});

describe('semantic mapping: proposed behaviours', () => {
  it('keeps mask-conceal as a creation request because occlude is unsupported', () => {
    const result = resolveMapping('b5', proposed());

    expect(result.identity).toBe('proposed');
    expect(result.finalResolution).toBe('create');
    expect(result.uncoveredOperations).toEqual(['occlude']);
  });

  it('composes a new behaviour when its operations are supported', () => {
    const result = resolveMapping('b3', proposed({
      proposed: 'staggered-labels',
      meaning: 'подписи появляются по одной',
      signature: {
        target: 'existing-text',
        initialState: 'absent',
        action: 'reveal',
        progression: 'sequential',
        finalState: 'visible',
      },
      semanticDifference: {
        comparedTo: 'sequence-stagger',
        dimension: 'target',
        existing: 'пустая область',
        required: 'существующий текст',
      },
      requiredActions: [{ operation: 'stagger', target: 'labels' }],
    }));

    expect(result.finalResolution).toBe('compose');
    expect(result.uncoveredOperations).toEqual([]);
  });

  it('rejects a claimed difference that is not a difference', () => {
    const result = resolveMapping(
      'b4',
      proposed({
        proposed: 'toggle-ish',
        signature: {
          target: 'empty-area',
          initialState: 'absent',
          action: 'fill',
          progression: 'sequential',
          finalState: 'filled',
        },
        semanticDifference: {
          comparedTo: 'fill-progressively',
          dimension: 'target',
          existing: 'пустая область',
          required: 'пустая область',
        },
        requiredActions: [{ operation: 'fill', target: 'grid' }],
      }),
    );

    expect(result.finalResolution).toBe('create');
    expect(result.signatureIssues[0]).toContain('is not a difference');
  });

  it('rejects a "proposed" behaviour whose id already exists', () => {
    const result = resolveMapping(
      'b5',
      proposed({
        proposed: 'draw-progressively',
        signature: {
          target: 'empty-area',
          initialState: 'absent',
          action: 'reveal',
          progression: 'left-to-right',
          finalState: 'visible',
        },
        semanticDifference: {
          comparedTo: 'fill-progressively',
          dimension: 'target',
          existing: 'пустая область',
          required: 'пустая область',
        },
        requiredActions: [{ operation: 'extend', target: 'line' }],
      }),
    );

    expect(result.finalResolution).toBe('create');
    expect(result.signatureIssues[0]).toContain('already exists');
  });

  it('rejects a comparison against an unknown behaviour', () => {
    const result = resolveMapping(
      'b4',
      proposed({
        proposed: 'ghost-reveal',
        semanticDifference: {
          comparedTo: 'not-in-registry',
          dimension: 'target',
          existing: 'a',
          required: 'b',
        },
      }),
    );

    expect(result.finalResolution).toBe('create');
    expect(result.signatureIssues[0]).toContain('is not in the registry');
  });
});
