import { describe, expect, it } from 'vitest';
import { inspectSvgStructure } from './svg-structure.js';

/**
 * The first accepted `subject/wifi-router` (2026-11-13) drew its top face as a
 * slanted quad above the body. Keep it as a fixture: the guard exists because
 * this exact document passed the allowlist and reached the renderer.
 */
const LID_ROUTER = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
  '<path fill="#0c1b31" d="M80 212h224l28-34H108z"/>',
  '<rect width="224" height="112" x="80" y="210" fill="#23405f" rx="18"/>',
  '<rect width="20" height="112" x="124" y="76" fill="#0c1b31" rx="10" transform="rotate(-10 134 132)"/>',
  '</svg>',
].join('');

const FLAT_ROUTER = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
  '<rect width="36" height="140" x="112" y="100" fill="#23405f" rx="7"/>',
  '<rect width="240" height="100" x="80" y="210" fill="#23405f" rx="16"/>',
  '<circle cx="128" cy="246" r="9" fill="#f2a025"/>',
  '</svg>',
].join('');

describe('svg structure guard', () => {
  it('flags a slanted top-face quad that sits on the body edge', () => {
    const violations = inspectSvgStructure(LID_ROUTER);
    const codes = violations.map((violation) => violation.code);

    expect(codes).toContain('top_face_polygon');
    expect(codes).toContain('perspective_transform');
    expect(
      violations.find((violation) => violation.code === 'top_face_polygon')
        ?.reason,
    ).toMatch(/верхнюю грань/i);
  });

  it('accepts a flat router built from axis-aligned primitives', () => {
    expect(inspectSvgStructure(FLAT_ROUTER)).toEqual([]);
  });

  it('accepts a triangular roof', () => {
    const house = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
      '<path d="M40 300 L200 120 L360 300 Z" fill="#f2a025"/>',
      '<rect width="220" height="180" x="90" y="300" fill="#23405f"/>',
      '</svg>',
    ].join('');

    expect(inspectSvgStructure(house)).toEqual([]);
  });

  it('accepts a standalone trapezoid with no body edge to sit on', () => {
    const cup = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
      '<path d="M120 120 L280 120 L250 300 L150 300 Z" fill="#f5f1e8"/>',
      '</svg>',
    ].join('');

    expect(inspectSvgStructure(cup)).toEqual([]);
  });

  it('ignores a small quad that cannot be a top face', () => {
    const small = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
      '<rect width="240" height="120" x="80" y="200" fill="#23405f"/>',
      '<path d="M180 200 L220 200 L226 194 L186 194 Z" fill="#0c1b31"/>',
      '</svg>',
    ].join('');

    expect(inspectSvgStructure(small)).toEqual([]);
  });

  it('flags any transform as a perspective cue', () => {
    const violations = inspectSvgStructure(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">' +
        '<rect width="40" height="120" x="100" y="100" transform="skewX(8)"/>' +
        '</svg>',
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.code).toBe('perspective_transform');
  });

  it('skips paths with curves instead of guessing', () => {
    const curved = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
      '<rect width="240" height="120" x="80" y="200" fill="#23405f"/>',
      '<path d="M80 200 C80 160 120 140 160 140 L200 200 Z" fill="#0c1b31"/>',
      '</svg>',
    ].join('');

    expect(
      inspectSvgStructure(curved).filter(
        (violation) => violation.code === 'top_face_polygon',
      ),
    ).toEqual([]);
  });
});
