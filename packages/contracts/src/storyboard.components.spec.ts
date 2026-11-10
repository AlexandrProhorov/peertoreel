import {
  COMPONENT_PARAMS_DEFAULTS,
  COMPONENT_PARAMS_SCHEMAS,
  STORYBOARD_COMPONENT_IDS,
  UnknownStoryboardComponentError,
  parseComponentParams,
  type StoryboardComponentId,
} from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';

describe('component params', () => {
  it('has a schema and defaults for every component id', () => {
    for (const componentId of STORYBOARD_COMPONENT_IDS) {
      expect(COMPONENT_PARAMS_SCHEMAS[componentId]).toBeDefined();
      expect(COMPONENT_PARAMS_DEFAULTS[componentId]).toEqual(
        COMPONENT_PARAMS_SCHEMAS[componentId].parse({}),
      );
    }
  });

  it('uses defaults and reports missing params', () => {
    const result = parseComponentParams('parallax-city', undefined);

    expect(result.params).toEqual(COMPONENT_PARAMS_DEFAULTS['parallax-city']);
    expect(result.diagnostics).toEqual([
      { path: '$', reason: 'params_missing', received: null },
    ]);
  });

  it('treats null params as missing', () => {
    const result = parseComponentParams('kinetic-typography', null);

    expect(result.params).toEqual(
      COMPONENT_PARAMS_DEFAULTS['kinetic-typography'],
    );
    expect(result.diagnostics[0]?.reason).toBe('params_missing');
  });

  it('fills absent fields silently', () => {
    const result = parseComponentParams('parallax-city', {
      buildingsSeed: 7,
    });

    expect(result.params).toEqual({
      ...COMPONENT_PARAMS_DEFAULTS['parallax-city'],
      buildingsSeed: 7,
    });
    expect(result.diagnostics).toEqual([]);
  });

  it('uses a per-field default and reports the invalid value', () => {
    const result = parseComponentParams('parallax-city', {
      buildingsSeed: 'hello',
      snowDensity: -100,
    });

    expect(result.params.buildingsSeed).toBe(
      COMPONENT_PARAMS_DEFAULTS['parallax-city'].buildingsSeed,
    );
    expect(result.params.snowDensity).toBe(
      COMPONENT_PARAMS_DEFAULTS['parallax-city'].snowDensity,
    );
    expect(result.diagnostics).toEqual([
      {
        path: 'buildingsSeed',
        reason: 'invalid_value',
        received: 'hello',
      },
      {
        path: 'snowDensity',
        reason: 'invalid_value',
        received: -100,
      },
    ]);
  });

  it('reports the array index of an invalid accent word', () => {
    const result = parseComponentParams('kinetic-typography', {
      accentWords: ['15', 42],
    });

    expect(result.params.accentWords).toEqual(
      COMPONENT_PARAMS_DEFAULTS['kinetic-typography'].accentWords,
    );
    expect(result.diagnostics).toEqual([
      { path: 'accentWords.1', reason: 'invalid_value', received: 42 },
    ]);
  });

  it('drops unknown keys with a non-fatal diagnostic', () => {
    const result = parseComponentParams('parallax-city', {
      buildingsSeed: 1,
      glitch: true,
    });

    expect(result.params).not.toHaveProperty('glitch');
    expect(result.diagnostics).toEqual([
      { path: 'glitch', reason: 'unknown_key', received: true },
    ]);
  });

  it('rejects non-object params with a whole-object diagnostic', () => {
    const result = parseComponentParams('parallax-city', 42);

    expect(result.params).toEqual(COMPONENT_PARAMS_DEFAULTS['parallax-city']);
    expect(result.diagnostics).toEqual([
      { path: '$', reason: 'invalid_value', received: 42 },
    ]);
  });

  it('throws for an unknown component id instead of using defaults', () => {
    expect(() =>
      parseComponentParams('unknown-component' as StoryboardComponentId, {}),
    ).toThrow(UnknownStoryboardComponentError);
  });

  it('does not leak mutations into shared defaults', () => {
    const result = parseComponentParams('kinetic-typography', {
      accentWords: ['15'],
    });

    result.params.accentWords.push('mutated');

    expect(
      COMPONENT_PARAMS_DEFAULTS['kinetic-typography'].accentWords,
    ).toEqual([]);
  });
});
