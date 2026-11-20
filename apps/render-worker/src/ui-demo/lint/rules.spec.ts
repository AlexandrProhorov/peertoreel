import { describe, expect, it } from 'vitest';
import type { MeasuredBox, MeasuredRect, SceneMeasurement } from './measure.js';
import { lintMeasurements, lintScene } from './rules.js';

function rect(x: number, y: number, width: number, height: number): MeasuredRect {
  return { x, y, width, height };
}

function box(
  kind: MeasuredBox['kind'],
  name: string,
  boxRect: MeasuredRect,
  extra: Partial<MeasuredBox> = {},
): MeasuredBox {
  return { kind, name, rect: boxRect, ...extra };
}

function measurement(overrides: Partial<SceneMeasurement> = {}): SceneMeasurement {
  return {
    sceneId: 'prompt-1',
    device: 'prompt-card',
    frame: 128,
    fontsReady: true,
    boxes: [
      box('device', 'prompt-card', rect(0, 0, 1080, 1920)),
      box('surface', 'card', rect(72, 488, 936, 451)),
      box('critical', 'card-text', rect(132, 546, 758, 336), {
        fontFamily: 'Onest, sans-serif',
        within: 'card',
      }),
      box('critical', 'caption', rect(452, 1010, 176, 40), {
        fontFamily: 'Onest, sans-serif',
      }),
    ],
    ...overrides,
  };
}

describe('ui lint rules', () => {
  it('accepts a layout that fits the content and platform bounds', () => {
    expect(lintScene(measurement())).toEqual([]);
  });

  it('reports text that leaves the device', () => {
    const violations = lintScene(
      measurement({
        boxes: [
          box('device', 'prompt-card', rect(0, 0, 1080, 1920)),
          box('surface', 'card', rect(72, 488, 936, 451)),
          box('critical', 'card-text', rect(1000, 546, 200, 336), {
            fontFamily: 'Onest, sans-serif',
            within: 'card',
          }),
        ],
      }),
    );

    expect(violations.map((violation) => violation.rule)).toContain(
      'critical-outside-device',
    );
  });

  it('reports text outside the content bounds', () => {
    const violations = lintScene(
      measurement({
        boxes: [
          box('device', 'prompt-card', rect(0, 0, 1080, 1920)),
          box('surface', 'card', rect(0, 488, 1080, 451)),
          box('critical', 'card-text', rect(20, 546, 200, 100), {
            fontFamily: 'Onest, sans-serif',
            within: 'card',
          }),
        ],
      }),
    );

    expect(violations.map((violation) => violation.rule)).toContain(
      'critical-outside-content',
    );
  });

  it('reports text that crosses the platform rail', () => {
    const violations = lintScene(
      measurement({
        boxes: [
          box('device', 'prompt-card', rect(0, 0, 1080, 1920)),
          box('surface', 'card', rect(72, 488, 936, 451)),
          box('critical', 'card-text', rect(132, 546, 800, 336), {
            fontFamily: 'Onest, sans-serif',
            within: 'card',
          }),
        ],
      }),
    );

    const rule = violations.find(
      (violation) => violation.rule === 'critical-in-platform-zone',
    );

    expect(rule?.message).toContain('right rail');
  });

  it('reports clipped text', () => {
    const violations = lintScene(
      measurement({
        boxes: [
          box('device', 'prompt-card', rect(0, 0, 1080, 1920)),
          box('surface', 'card', rect(72, 488, 936, 451)),
          box('critical', 'card-text', rect(132, 546, 758, 400), {
            fontFamily: 'Onest, sans-serif',
            overflowY: true,
            within: 'card',
          }),
        ],
      }),
    );

    expect(violations.map((violation) => violation.rule)).toContain(
      'content-clipped',
    );
  });

  it('reports text that overflows its own box even without clipping', () => {
    const violations = lintScene(
      measurement({
        boxes: [
          box('device', 'prompt-card', rect(0, 0, 1080, 1920)),
          box('surface', 'card', rect(72, 488, 936, 451)),
          box('critical', 'card-text', rect(132, 546, 758, 336), {
            fontFamily: 'Onest, sans-serif',
            within: 'card',
            overflowText: true,
          }),
        ],
      }),
    );

    expect(violations.map((violation) => violation.rule)).toContain('text-overflow');
  });

  it('reports overlapping critical boxes', () => {
    const violations = lintScene(
      measurement({
        boxes: [
          box('device', 'prompt-card', rect(0, 0, 1080, 1920)),
          box('surface', 'card', rect(72, 488, 936, 451)),
          box('critical', 'card-text', rect(132, 546, 758, 336), {
            fontFamily: 'Onest, sans-serif',
            within: 'card',
          }),
          box('critical', 'caption', rect(132, 700, 758, 100), {
            fontFamily: 'Onest, sans-serif',
          }),
        ],
      }),
    );

    expect(violations.map((violation) => violation.rule)).toContain(
      'critical-overlap',
    );
  });

  it('allows a declared intentional overlap', () => {
    const violations = lintScene(
      measurement({
        boxes: [
          box('device', 'prompt-card', rect(0, 0, 1080, 1920)),
          box('surface', 'card', rect(72, 488, 936, 451)),
          box('critical', 'card-text', rect(132, 546, 758, 336), {
            fontFamily: 'Onest, sans-serif',
            within: 'card',
          }),
          box('critical', 'caption', rect(132, 700, 758, 100), {
            fontFamily: 'Onest, sans-serif',
            overlapAllowed: true,
          }),
        ],
      }),
    );

    expect(violations.map((violation) => violation.rule)).not.toContain(
      'critical-overlap',
    );
  });

  it('reports a fallback font and a font that never loaded', () => {
    const fallback = lintScene(
      measurement({
        boxes: [
          box('device', 'prompt-card', rect(0, 0, 1080, 1920)),
          box('surface', 'card', rect(72, 488, 936, 451)),
          box('critical', 'card-text', rect(132, 546, 758, 336), {
            fontFamily: 'Arial, sans-serif',
            within: 'card',
          }),
        ],
      }),
    );
    const notLoaded = lintScene(measurement({ fontsReady: false }));

    expect(
      fallback.some(
        (violation) =>
          violation.rule === 'font-fallback' &&
          violation.message.includes('Arial'),
      ),
    ).toBe(true);
    expect(
      notLoaded.some((violation) =>
        violation.message.includes('did not finish loading'),
      ),
    ).toBe(true);
  });

  it('reports contract violations: missing role, missing surface, unknown device', () => {
    const missingRole = lintScene(
      measurement({
        boxes: [
          box('device', 'prompt-card', rect(0, 0, 1080, 1920)),
          box('surface', 'card', rect(72, 488, 936, 451)),
        ],
      }),
    );
    const unknown = lintScene(
      measurement({ device: 'carousel' }),
    );

    expect(missingRole.map((violation) => violation.rule)).toContain('contract');
    expect(unknown[0]?.message).toContain('Unknown device');
  });

  it('warns about an unknown critical role without failing the scene', () => {
    const violations = lintScene(
      measurement({
        boxes: [
          box('device', 'prompt-card', rect(0, 0, 1080, 1920)),
          box('surface', 'card', rect(72, 488, 936, 451)),
          box('critical', 'card-text', rect(132, 546, 758, 336), {
            fontFamily: 'Onest, sans-serif',
            within: 'card',
          }),
          box('critical', 'typo-role', rect(132, 900, 100, 40), {
            fontFamily: 'Onest, sans-serif',
          }),
        ],
      }),
    );

    expect(
      violations.find((violation) => violation.element === 'typo-role')
        ?.severity,
    ).toBe('warning');
  });

  it('reports unrelated boxes that paint over each other', () => {
    const violations = lintScene(
      measurement({
        boxes: [
          box('device', 'prompt-card', rect(0, 0, 1080, 1920)),
          box('surface', 'card', rect(72, 488, 936, 451)),
          box('surface', 'badge', rect(600, 700, 300, 200)),
          box('critical', 'card-text', rect(132, 546, 758, 336), {
            fontFamily: 'Onest, sans-serif',
            within: 'card',
          }),
        ],
      }),
    );

    const overlap = violations.find((violation) => violation.rule === 'unrelated-overlap');

    expect(overlap).toBeDefined();
    expect(overlap?.severity).toBe('warning');
  });

  it('lints every scene in a batch', () => {
    const violations = lintMeasurements([
      measurement(),
      measurement({ sceneId: 'chat', device: 'chat-reconstruction', boxes: [] }),
    ]);

    expect(violations.length).toBeGreaterThan(0);
    expect(
      violations.every((violation) => violation.sceneId === 'chat'),
    ).toBe(true);
  });
});
