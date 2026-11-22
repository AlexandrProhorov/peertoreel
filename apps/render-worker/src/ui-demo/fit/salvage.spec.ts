import { describe, expect, it } from 'vitest';
import { checkTextBox } from '../typography-rules.js';
import { normalizeRawEpisode } from './normalize.js';
import { salvageScene, type Repair } from './salvage.js';

/**
 * Salvage cuts what cannot change the meaning and records every cut. These tests
 * pin the boundary: a detail is repaired, a lost scene is never invented.
 */

function scene(params: Record<string, Record<string, unknown>>, primitiveOf: Record<string, string>): unknown {
  return {
    id: 'salvage',
    spec: {
      kind: 'composition',
      elements: Object.entries(params).map(([id, values]) => ({
        id,
        primitive: primitiveOf[id] ?? 'card',
        layout: { x: 72, y: 600, width: 480, height: 240 },
        params: values,
      })),
      sequence: [],
    },
  };
}

function repairsOf(value: unknown): Repair[] {
  const repairs: Repair[] = [];
  salvageScene(value, repairs);

  return repairs;
}

describe('salvage', () => {
  it('removes `"none"` from a colour parameter instead of rejecting the scene', () => {
    const value = scene({ card: { background: '#161618', border: 'none' } }, { card: 'card' });
    const repairs = repairsOf(value);
    const result = salvageScene(value, []) as {
      spec: { elements: ReadonlyArray<{ params: Record<string, unknown> }> };
    };

    expect(result.spec.elements[0]?.params).toEqual({ background: '#161618' });
    expect(repairs).toHaveLength(1);
    expect(repairs[0]).toMatchObject({
      path: 'card.border',
      element: 'card',
      from: 'none',
      to: '(removed)',
    });
  });

  it('maps a boolean shadow to the nearest enum value', () => {
    const value = scene(
      { a: { shadow: true }, b: { shadow: false } },
      { a: 'card', b: 'card' },
    );
    const result = salvageScene(value, []) as {
      spec: { elements: ReadonlyArray<{ params: Record<string, unknown> }> };
    };

    expect(result.spec.elements[0]?.params['shadow']).toBe('soft');
    expect(result.spec.elements[1]?.params['shadow']).toBe('none');
  });

  it('clamps a number to the declared range', () => {
    const value = scene({ a: { radius: 900 } }, { a: 'card' });
    const result = salvageScene(value, []) as {
      spec: { elements: ReadonlyArray<{ params: Record<string, unknown> }> };
    };

    expect(result.spec.elements[0]?.params['radius']).toBe(48);
  });

  it('drops an undocumented parameter and says which one', () => {
    const value = scene({ a: { glow: 0.5 } }, { a: 'card' });
    const repairs = repairsOf(value);

    expect(repairs[0]).toMatchObject({ path: 'card.glow', from: '0.5' });
  });

  it('repairs a known typo instead of dropping the copy', () => {
    const value = scene({ a: { text_: 'Скидка', tone: 'ink' } }, { a: 'pill' });
    const repairs: Repair[] = [];
    const result = salvageScene(value, repairs) as {
      spec: { elements: ReadonlyArray<{ params: Record<string, unknown> }> };
    };

    expect(result.spec.elements[0]?.params['text']).toBe('Скидка');
    expect(result.spec.elements[0]?.params['text_']).toBeUndefined();
    expect(repairs[0]).toMatchObject({ path: 'pill.text_', reason: 'alias: the model wrote a known typo' });
  });

  it('turns a state written as a parameter into a state', () => {
    const value = scene({ a: { text: 'Кнопка', active: true } }, { a: 'pill' });
    const repairs: Repair[] = [];
    const result = salvageScene(value, repairs) as {
      spec: { elements: ReadonlyArray<{ states?: string[]; params: Record<string, unknown> }> };
    };

    expect(result.spec.elements[0]?.states).toContain('active');
    expect(result.spec.elements[0]?.params['active']).toBeUndefined();
    expect(repairs[0]).toMatchObject({ path: 'pill.active', to: 'states.active' });
  });

  it('tells a mix-up from a typo when it drops a parameter', () => {
    const value = scene({ a: { padding: 24 } }, { a: 'bubble' });
    const repairs = repairsOf(value);

    expect(repairs[0]).toMatchObject({
      path: 'bubble.padding',
      reason: 'parameter belongs to another primitive',
    });
  });

  it('says when a transition is actually an operation', () => {
    const value = {
      id: 'grab',
      spec: {
        kind: 'composition',
        elements: [
          {
            id: 'rail',
            primitive: 'track',
            layout: { x: 100, y: 100, width: 480, height: 20 },
            params: { length: 480, thickness: 20, fill: 0.4 },
          },
        ],
        sequence: [
          { element: 'rail', transition: 'appear' },
          { element: 'rail', transition: 'move' },
        ],
      },
    };
    const repairs = repairsOf(value);

    expect(repairs[0]).toMatchObject({
      path: 'track.move',
      reason: 'operation written as a transition',
    });
  });

  it('drops a transition the primitive does not have', () => {
    const value = {
      id: 'grab',
      spec: {
        kind: 'composition',
        elements: [
          {
            id: 'hand',
            primitive: 'thumb',
            layout: { x: 100, y: 100, width: 300, height: 72 },
            params: { size: 72 },
          },
        ],
        sequence: [
          { element: 'hand', transition: 'appear' },
          { element: 'hand', transition: 'grab' },
        ],
      },
    };
    const repairs: Repair[] = [];
    const result = salvageScene(value, repairs) as {
      spec: { sequence: ReadonlyArray<{ transition: string }> };
    };

    expect(result.spec.sequence.map((step) => step.transition)).toEqual(['appear']);
    expect(repairs[0]).toMatchObject({ path: 'thumb.grab', from: 'grab' });
  });

  it('leaves a valid scene untouched', () => {
    const value = scene({ a: { background: '#161618', radius: 40 } }, { a: 'card' });

    expect(repairsOf(value)).toEqual([]);
  });

  it('drops an undeclared transition from the element declaration', () => {
    const value = {
      id: 'declared',
      spec: {
        kind: 'composition',
        elements: [
          {
            id: 'plate',
            primitive: 'card',
            layout: { x: 72, y: 600, width: 480, height: 240 },
            params: { background: '#161618' },
            states: ['rest'],
            transitions: ['appear', 'type'],
            operations: ['reveal', 'type-on'],
            links: [],
          },
        ],
        sequence: [],
      },
    };
    const repairs: Repair[] = [];
    const result = salvageScene(value, repairs) as {
      spec: {
        elements: ReadonlyArray<{
          transitions: string[];
          operations: string[];
        }>;
      };
    };

    expect(result.spec.elements[0]?.transitions).toEqual(['appear']);
    expect(repairs.map((repair) => repair.path)).toEqual([
      'card.transitions.type',
      'card.operations.type-on',
    ]);
  });

  it('restores a missing schemaVersion instead of rejecting the answer', () => {
    /* The model echoed the API option: {"type": "json_object", ...} and no
       schemaVersion, while the scene itself is complete. */
    const raw = {
      type: 'json_object',
      themeId: 'studio-dark',
      scenes: [
        {
          id: 'echo',
          device: 'spec',
          durationSec: 3,
          revealSec: 1,
          themeId: 'studio-dark',
          spec: {
            kind: 'composition',
            elements: [
              {
                id: 'a',
                primitive: 'label',
                layout: { x: 72, y: 600, width: 480, height: 160 },
                params: { text: 'текст', token: 'headline', tone: 'ink' },
              },
            ],
            sequence: [],
          },
        },
      ],
    };
    const repairs: Repair[] = [];
    const normalized = normalizeRawEpisode(raw, repairs) as { schemaVersion: number };

    expect(normalized.schemaVersion).toBe(1);
    expect(repairs[0]).toMatchObject({ path: 'schemaVersion', to: '1' });
  });

  it('drops the tone when an explicit text colour is declared', () => {
    const value = {
      id: 'ink',
      spec: {
        kind: 'composition',
        elements: [
          {
            id: 'title',
            primitive: 'label',
            layout: { x: 72, y: 600, width: 700, height: 160 },
            params: {
              text: 'заголовок',
              token: 'headline',
              tone: 'surface',
              textColor: '#FFFFFF',
            },
          },
        ],
        sequence: [],
      },
    };
    const repairs: Repair[] = [];
    const result = salvageScene(value, repairs) as {
      spec: { elements: ReadonlyArray<{ params: Record<string, unknown> }> };
    };
    const params = result.spec.elements[0]?.params ?? {};

    expect(params['tone']).toBeUndefined();
    expect(params['textColor']).toBe('#FFFFFF');
    expect(repairs[0]).toMatchObject({ path: 'label.tone', from: 'surface' });
  });

  it('infers a type token and a default ink for text without style', () => {
    const value = {
      id: 'style',
      spec: {
        kind: 'composition',
        elements: [
          {
            id: 'line',
            primitive: 'label',
            layout: { x: 72, y: 600, width: 480, height: 150 },
            params: { text: 'текст без стиля' },
          },
        ],
        sequence: [],
      },
    };
    const repairs: Repair[] = [];
    const result = salvageScene(value, repairs) as {
      spec: { elements: ReadonlyArray<{ params: Record<string, unknown> }> };
    };
    const params = result.spec.elements[0]?.params ?? {};

    expect(typeof params['token']).toBe('string');
    expect(checkTextBox(String(params['token']), 150)).toBeNull();
    expect(params['tone']).toBe('ink');
    expect(repairs.map((repair) => repair.path)).toEqual([
      'label.token',
      'label.tone',
    ]);
  });

  it('leaves the ink to the author when a background is declared', () => {
    const value = {
      id: 'styled',
      spec: {
        kind: 'composition',
        elements: [
          {
            id: 'chip',
            primitive: 'pill',
            layout: { x: 72, y: 600, width: 480, height: 112 },
            params: { text: 'плашка', background: '#CCFF00' },
          },
        ],
        sequence: [],
      },
    };
    const result = salvageScene(value, []) as {
      spec: { elements: ReadonlyArray<{ params: Record<string, unknown> }> };
    };

    expect(result.spec.elements[0]?.params['tone']).toBeUndefined();
    expect(result.spec.elements[0]?.params['textColor']).toBeUndefined();
  });

  it('drops a grid that content stands on', () => {
    const value = {
      id: 'grid',
      spec: {
        kind: 'composition',
        elements: [
          {
            id: 'cells',
            primitive: 'grid',
            layout: { x: 72, y: 200, width: 600, height: 400 },
            params: { columns: 4, rows: 3 },
          },
          {
            id: 'note',
            primitive: 'label',
            layout: { x: 100, y: 300, width: 400, height: 120 },
            params: { text: 'много', token: 'caption', tone: 'ink' },
          },
        ],
        sequence: [
          { element: 'cells', transition: 'appear' },
          { element: 'note', transition: 'type' },
        ],
      },
    };
    const repairs: Repair[] = [];
    const result = salvageScene(value, repairs) as {
      spec: {
        elements: ReadonlyArray<{ id: string }>;
        sequence: ReadonlyArray<{ element: string }>;
      };
    };

    /* The decoration yields: text on cells is unreadable, the copy stays. */
    expect(result.spec.elements.map((element) => element.id)).toEqual(['note']);
    expect(result.spec.sequence.map((step) => step.element)).toEqual(['note']);
    expect(repairs[0]).toMatchObject({ path: 'grid', from: 'grid' });
  });

  it('does not rescue an unknown primitive: the validator must reject it', () => {
    const value = {
      id: 'unknown',
      spec: {
        kind: 'composition',
        elements: [
          {
            id: 'x',
            primitive: 'hologram',
            layout: { x: 72, y: 600, width: 480, height: 240 },
            params: {},
          },
        ],
        sequence: [],
      },
    };

    expect(repairsOf(value)).toEqual([]);
    expect((salvageScene(value, []) as { spec: { elements: unknown[] } }).spec.elements).toHaveLength(1);
  });
});
