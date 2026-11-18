import { describe, expect, it } from 'vitest';
import { uiEpisodeSchema } from './spec.js';
import { lintQuality } from './quality.js';
import type { CompositionSpec } from './composition.js';

function scene(spec: CompositionSpec): unknown {
  return {
    schemaVersion: 1,
    themeId: 'studio-dark',
    captions: false,
    speech: [],
    scenes: [
      {
        id: 'quality',
        device: 'spec',
        durationSec: 2.5,
        revealSec: 1,
        themeId: 'studio-dark',
        spec,
      },
    ],
  };
}

function baseSpec(): CompositionSpec {
  return {
    kind: 'composition',
    elements: [
      {
        id: 'e1',
        primitive: 'card',
        layout: { x: 72, y: 600, width: 818, height: 420 },
        params: { background: '#161618', radius: 40, padding: 48 },
        states: [],
        transitions: [],
        operations: [],
        links: [],
      },
      {
        id: 'e2',
        primitive: 'label',
        layout: { x: 120, y: 660, width: 700, height: 90 },
        params: {
          text: 'главная мысль',
          token: 'headline',
          tone: 'ink',
          weight: 700,
        },
        states: [],
        transitions: [],
        operations: [],
        links: [],
      },
      {
        id: 'e3',
        primitive: 'label',
        layout: { x: 120, y: 780, width: 400, height: 80 },
        params: { text: 'деталь', token: 'label', tone: 'accent' },
        states: [],
        transitions: [],
        operations: [],
        links: [],
      },
    ],
    sequence: [],
  };
}

function codes(spec: CompositionSpec): string[] {
  return lintQuality(spec).map((issue) => issue.code);
}

describe('quality gate', () => {
  it('accepts a scene with hierarchy, surface and accent', () => {
    expect(codes(baseSpec())).toEqual([]);
  });

  it('requires explicit token and tone for text', () => {
    const spec = baseSpec();
    spec.elements[1] = {
      ...spec.elements[1]!,
      params: { text: 'без стиля' },
    };

    expect(codes(spec)).toContain('style-required');
  });

  it('requires a readable hierarchy', () => {
    const spec = baseSpec();
    spec.elements = spec.elements.map((element) =>
      element.primitive === 'label'
        ? { ...element, params: { ...element.params, token: 'caption' } }
        : element,
    );

    expect(codes(spec)).toContain('hierarchy-required');
  });

  it('requires an accent element', () => {
    const spec = baseSpec();
    spec.elements[2] = {
      ...spec.elements[2]!,
      params: { text: 'деталь', token: 'label', tone: 'muted' },
    };

    expect(codes(spec)).toContain('accent-required');
  });

  it('rejects a surface that is almost the stage colour', () => {
    const spec = baseSpec();
    spec.elements[0] = {
      ...spec.elements[0]!,
      params: { background: '#0C0C0D' },
    };

    expect(codes(spec)).toContain('surface-visible');
  });

  it('compares a surface to the declared stage, not to the theme', () => {
    /* White card on a white stage inside the lime theme: against the theme
       background the pair looks fine, on the frame it is invisible. */
    const spec = baseSpec();
    spec.elements[0] = {
      ...spec.elements[0]!,
      params: { background: '#FFFFFF' },
    };
    spec.elements.unshift({
      id: 'bg',
      primitive: 'stage',
      layout: { x: 0, y: 0, width: 1080, height: 1920 },
      params: { background: '#FFFFFF' },
      states: [],
      transitions: [],
      operations: [],
      links: [],
    });

    const issues = lintQuality(spec, 'studio-lime');

    expect(issues.map((issue) => issue.code)).toContain('surface-visible');
  });

  it('rejects low-contrast text', () => {
    const spec = baseSpec();
    spec.elements[0] = {
      ...spec.elements[0]!,
      params: { background: '#2B2B2B' },
    };
    spec.elements[1] = {
      ...spec.elements[1]!,
      params: { text: 'серое на сером', token: 'label', tone: 'muted' },
    };

    expect(codes(spec)).toContain('text-contrast');
  });

  it('rejects an empty scene', () => {
    const spec = baseSpec();
    spec.elements = [spec.elements[0]!];

    expect(codes(spec)).toContain('density');
  });

  it('is enforced by the scene schema, not only by the helper', () => {
    const spec = baseSpec();
    spec.elements[1] = { ...spec.elements[1]!, params: { text: 'без стиля' } };

    expect(() => uiEpisodeSchema.parse(scene(spec))).toThrow(
      /quality\/style-required/,
    );
  });
});
