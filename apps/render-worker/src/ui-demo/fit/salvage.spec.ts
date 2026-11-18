import { describe, expect, it } from 'vitest';
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
