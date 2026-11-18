import { describe, expect, it } from 'vitest';
import {
  IMPLEMENTATIONS,
  MAX_ELEMENTS_PER_SCENE,
  MAX_INSTANCES_PER_PRIMITIVE,
  PRIMITIVES,
  implementationById,
  type PrimitiveId,
} from './catalog.js';
import {
  parseComposition,
  validateComposition,
  type CompositionSpec,
} from './composition.js';
import {
  candidatesForAffordances,
  uncoveredAffordances,
} from './selection.js';

const PRIMITIVE_IDS = Object.keys(PRIMITIVES) as PrimitiveId[];

function element(
  id: string,
  primitive: string,
  extra: Partial<CompositionSpec['elements'][number]> = {},
): CompositionSpec['elements'][number] {
  return {
    id,
    primitive,
    layout: { x: 0, y: 0, width: 400, height: 120 },
    params: {},
    states: [],
    transitions: [],
    operations: [],
    links: [],
    ...extra,
  };
}

function validSpec(): CompositionSpec {
  return {
    kind: 'composition',
    elements: [
      element('e1', 'stage', {
        params: { background: '#0A0A0B', grid: true },
        states: ['rest'],
        transitions: ['appear'],
        operations: ['hold'],
      }),
      element('e2', 'card', {
        params: { background: '#CCFF00', radius: 40 },
        states: ['rest'],
        transitions: ['appear'],
        operations: ['reveal'],
        links: ['e3'],
      }),
      element('e3', 'label', {
        params: { text: 'Исходя из всех наших разговоров', tone: 'ink', weight: 600 },
        states: ['rest'],
        transitions: ['appear'],
        operations: ['type-on'],
      }),
    ],
    sequence: [
      { at: 0, element: 'e1', transition: 'appear' },
      { at: 0.2, element: 'e2', transition: 'appear' },
      /* A valid scene has an action: appearing is not an event. */
      { at: 1, element: 'e3', transition: 'type' },
    ],
  };
}

describe('primitive contracts', () => {
  it('gives every primitive the appear/disappear lifecycle', () => {
    for (const id of PRIMITIVE_IDS) {
      expect(PRIMITIVES[id].transitions).toContain('appear');
      expect(PRIMITIVES[id].transitions).toContain('disappear');
    }
  });

  it('documents every parameter with a supported type', () => {
    for (const id of PRIMITIVE_IDS) {
      for (const [name, rule] of Object.entries(PRIMITIVES[id].parameters)) {
        expect(name.length, `${id} parameter name`).toBeGreaterThan(0);
        expect(
          ['number', 'string', 'boolean', 'color', 'enum', 'asset'],
          `${id}.${name}`,
        ).toContain(rule.type);

        if (rule.type === 'enum') {
          expect(rule.values?.length ?? 0).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keeps every primitive able to do something', () => {
    for (const id of PRIMITIVE_IDS) {
      expect(PRIMITIVES[id].operations.length).toBeGreaterThan(0);
      expect(PRIMITIVES[id].states.length).toBeGreaterThan(0);
    }
  });
});

describe('implementation contracts', () => {
  it('has unique ids and complete declarations', () => {
    const ids = IMPLEMENTATIONS.map((item) => item.id);

    expect(new Set(ids).size).toBe(ids.length);

    for (const implementation of IMPLEMENTATIONS) {
      expect(implementation.affordances.length).toBeGreaterThan(0);
      expect(implementation.parameters.length).toBeGreaterThan(0);
      expect(implementation.operations.length).toBeGreaterThan(0);
      expect(implementation.compositionProfile.dominantElement.length).toBeGreaterThan(0);
    }
  });

  it('contains only implementations that exist in code', () => {
    /* Declared-but-unbuilt capabilities must not be reusable. */
    expect(implementationById('feed-conveyor')).toBeNull();
    expect(implementationById('slider-control')).toBeNull();
    expect(implementationById('grid-fill')).toBeNull();
  });
});

describe('composition validation', () => {
  it('accepts a composition inside the contracts', () => {
    expect(validateComposition(validSpec())).toEqual([]);
  });

  it('rejects an unknown primitive', () => {
    const spec = validSpec();
    spec.elements[1] = element('e2', 'hologram');

    expect(validateComposition(spec).map((issue) => issue.code)).toContain(
      'unknown-primitive',
    );
  });

  it('rejects an undocumented parameter', () => {
    const spec = validSpec();
    spec.elements[1] = element('e2', 'card', {
      params: { crack: 0.5 } as CompositionSpec['elements'][number]['params'],
    });

    const issues = validateComposition(spec);

    expect(issues.map((issue) => issue.code)).toContain('unknown-parameter');
  });

  it('rejects a parameter outside its range, enum or length', () => {
    const spec = validSpec();
    spec.elements[1] = element('e2', 'card', { params: { radius: 400 } });
    spec.elements[2] = element('e3', 'label', {
      params: { tone: 'neon', weight: 900, text: 'x'.repeat(200) },
    });

    const codes = validateComposition(spec).map((issue) => issue.code);

    expect(codes).toContain('parameter-range');
    expect(codes).toContain('parameter-enum');
    expect(codes).toContain('parameter-length');
  });

  it('rejects an uncontracted state, transition and operation', () => {
    const spec = validSpec();
    spec.elements[1] = element('e2', 'card', {
      states: ['shattered'],
      transitions: ['crack'],
      operations: ['shatter'],
    });

    const codes = validateComposition(spec).map((issue) => issue.code);

    expect(codes).toContain('unknown-state');
    expect(codes).toContain('unknown-transition');
    expect(codes).toContain('unknown-operation');
  });

  it('rejects a link to a missing element', () => {
    const spec = validSpec();
    spec.elements[1] = element('e2', 'card', { links: ['e99'] });

    expect(validateComposition(spec).map((issue) => issue.code)).toContain(
      'dangling-link',
    );
  });

  it('rejects a composition above the element budget', () => {
    const spec = validSpec();
    spec.elements = [
      element('e1', 'card'),
      element('e2', 'label'),
      element('e3', 'pill'),
      element('e4', 'bubble'),
      element('e5', 'avatar'),
      element('e6', 'object'),
      element('e7', 'line'),
    ];

    expect(spec.elements.length).toBeGreaterThan(MAX_ELEMENTS_PER_SCENE);
    expect(validateComposition(spec).map((issue) => issue.code)).toContain(
      'element-budget',
    );
  });

  it('rejects too many instances of one primitive', () => {
    const spec = validSpec();
    spec.elements = Array.from(
      { length: MAX_INSTANCES_PER_PRIMITIVE + 1 },
      (_, index) => element(`e${index}`, 'label'),
    );

    expect(validateComposition(spec).map((issue) => issue.code)).toContain(
      'primitive-budget',
    );
  });

  it('rejects a token that does not fit its box', () => {
    const spec = validSpec();
    spec.elements = [
      element('e1', 'stage', { params: { background: '#0A0A0B' } }),
      element('e2', 'label', {
        params: { text: 'мелко', token: 'headline', tone: 'ink' },
        layout: { x: 0, y: 0, width: 400, height: 40 },
      }),
    ];

    expect(validateComposition(spec).map((issue) => issue.code)).toContain(
      'typography-fit',
    );
  });

  it('rejects a token that is too small for its box', () => {
    const spec = validSpec();
    spec.elements = [
      element('e1', 'stage', { params: { background: '#0A0A0B' } }),
      element('e2', 'label', {
        params: { text: 'крошечный текст', token: 'label', tone: 'ink' },
        layout: { x: 0, y: 0, width: 400, height: 420 },
      }),
    ];

    expect(validateComposition(spec).map((issue) => issue.code)).toContain(
      'typography-fit',
    );
  });

  it('accepts a token that suits its box', () => {
    const spec = validSpec();
    spec.elements = [
      element('e1', 'stage', { params: { background: '#0A0A0B' } }),
      element('e2', 'label', {
        params: { text: 'нормальный', token: 'headline', tone: 'ink' },
        layout: { x: 0, y: 0, width: 400, height: 160 },
      }),
    ];

    expect(
      validateComposition(spec).filter((issue) => issue.code === 'typography-fit'),
    ).toEqual([]);
  });

  it('rejects a cue that changes text on a container', () => {
    const spec = validSpec();
    spec.elements = [
      element('e1', 'stage', { params: { background: '#0A0A0B' } }),
      element('e2', 'card', { params: { background: '#161618' } }),
    ];
    spec.sequence = [{ at: 0.5, element: 'e2', transition: 'appear', text: 'нет' }];

    expect(validateComposition(spec).map((issue) => issue.code)).toContain(
      'text-not-supported',
    );
  });

  it('rejects a sequence step that points at a missing element or transition', () => {
    const spec = validSpec();
    spec.sequence = [
      { at: 0, element: 'e99', transition: 'appear' },
      { at: 0.4, element: 'e2', transition: 'crack' },
    ];

    const codes = validateComposition(spec).map((issue) => issue.code);

    expect(codes).toContain('sequence-unknown-element');
    expect(codes).toContain('unknown-transition');
  });

  it('reports malformed shapes as invalid specs', () => {
    const result = parseComposition({ kind: 'composition', elements: [] });

    expect(result.spec).toBeNull();
    expect(result.issues.map((issue) => issue.code)).toContain('invalid-spec');
  });

  it('accepts `tone` and `textColor` on every text primitive', () => {
    /* One ink dictionary: a foreign author may name the theme ink or the hex,
       on a label, a pill or a bubble. Neither name is an unknown parameter. */
    const spec: CompositionSpec = {
      kind: 'composition',
      elements: [
        element('e1', 'stage', { params: { background: '#0A0A0B' } }),
        element('e2', 'label', {
          params: { text: 'текст', token: 'caption', textColor: '#FFFFFF' },
        }),
        element('e3', 'pill', {
          params: { text: 'плашка', token: 'caption', tone: 'ink' },
        }),
        element('e4', 'bubble', {
          params: { text: 'реплика', token: 'caption', tone: 'ink' },
        }),
      ],
      sequence: [{ at: 0, element: 'e1', transition: 'appear' }],
    };

    expect(
      validateComposition(spec).filter((issue) => issue.code === 'unknown-parameter'),
    ).toEqual([]);
  });
});

describe('candidate pre-filter', () => {
  it('is deterministic, sorted and capped', () => {
    const first = candidatesForAffordances(['emphasis', 'quoted-prompt']);
    const second = candidatesForAffordances(['emphasis', 'quoted-prompt']);

    expect(first).toEqual(second);
    expect(first.length).toBeLessThanOrEqual(3);
    expect(first[0]?.implementation.id).toBe('prompt-card');
    expect(first[0]?.matchedAffordances).toEqual(
      expect.arrayContaining(['quoted-prompt', 'emphasis']),
    );
  });

  it('returns nothing and reports the gap for an uncovered affordance', () => {
    expect(candidatesForAffordances(['control-adjust'])).toEqual([]);
    expect(uncoveredAffordances(['control-adjust', 'emphasis'])).toEqual([
      'control-adjust',
    ]);
  });
});
