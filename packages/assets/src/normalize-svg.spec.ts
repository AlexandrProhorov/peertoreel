import { STYLE_PRESETS } from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import {
  InvalidSvgError,
  normalizeSvg,
  readSvgViewBox,
  type SvgNormalizationResult,
} from './normalize-svg.js';

const PALETTE = STYLE_PRESETS.studio_flat_2d_v1.assetPalette;

const BACKGROUND_AND_SUBJECT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="0" y="0" width="100" height="100" fill="#101820"/>
  <circle cx="50" cy="50" r="20" fill="#F59E0A"/>
</svg>`;

function fillColors(result: SvgNormalizationResult): string[] {
  return [...result.svg.matchAll(/fill="(#[0-9a-fA-F]{3,8})"/g)].map((match) =>
    match[1]!.toUpperCase(),
  );
}

describe('SVG normalization', () => {
  it('removes a full-bleed background rect without touching geometry', () => {
    const result = normalizeSvg(BACKGROUND_AND_SUBJECT, { palette: PALETTE });

    expect(result.removedBackgroundRects).toBe(1);
    expect(result.svg).not.toMatch(/<rect\b/);
    expect(result.svg).toMatch(/<circle[^>]*cx="50"/);
    expect(result.svg).toMatch(/<circle[^>]*cy="50"/);
    expect(result.svg).toMatch(/<circle[^>]*r="20"/);
  });

  it('pads the viewBox by 8% per side instead of rescaling content', () => {
    const result = normalizeSvg(BACKGROUND_AND_SUBJECT, { palette: PALETTE });

    expect(result.viewBox).toEqual({
      minX: -8,
      minY: -8,
      width: 116,
      height: 116,
    });
    expect(result.svg).toContain('viewBox="-8 -8 116 116"');
  });

  it('keeps a non-full-bleed rect', () => {
    const result = normalizeSvg(
      '<svg viewBox="0 0 100 100"><rect x="40" y="40" width="20" height="20" fill="#0B1220"/></svg>',
      { palette: PALETTE },
    );

    expect(result.removedBackgroundRects).toBe(0);
    expect(result.svg).toMatch(/<path\b/);
    expect(result.svg).toContain('fill="#0B1220"');
  });

  it('quantizes every fill/stroke into the assetPalette', () => {
    const result = normalizeSvg(BACKGROUND_AND_SUBJECT, { palette: PALETTE });
    const allowed = PALETTE.map((color) => color.toUpperCase());

    for (const color of fillColors(result)) {
      expect(allowed).toContain(color);
    }

    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0]).toMatchObject({
      from: '#F59E0A',
      to: '#F59E0B',
    });
    expect(result.replacements[0]?.distance).toBeGreaterThan(0);
    expect(result.maxColorDistance).toBeLessThan(0.01);
  });

  it('quantizes stroke colors and inline styles', () => {
    const result = normalizeSvg(
      '<svg viewBox="0 0 100 100"><path d="M10 10 L90 90" fill="none" stroke="#101820" style="stroke-width:4;stroke:#F8F8EE"/></svg>',
      { palette: PALETTE },
    );

    expect(result.svg).not.toContain('#101820');
    expect(result.svg).not.toContain('#F8F8EE');
    expect(result.svg).toContain('fill="none"');
  });

  it('is deterministic: the same input yields identical output', () => {
    const first = normalizeSvg(BACKGROUND_AND_SUBJECT, { palette: PALETTE });
    const second = normalizeSvg(BACKGROUND_AND_SUBJECT, { palette: PALETTE });

    expect(second).toEqual(first);
  });

  it('skips quantization when the palette is empty', () => {
    const result = normalizeSvg(BACKGROUND_AND_SUBJECT, { palette: [] });

    expect(result.replacements).toEqual([]);
    expect(result.maxColorDistance).toBe(0);
    expect(result.svg).toMatch(/fill="#F59E0A"/i);
  });

  it('rejects a document without an svg root', () => {
    expect(() => normalizeSvg('<div>nope</div>', { palette: PALETTE })).toThrow(
      InvalidSvgError,
    );
  });

  it('keeps a full-bleed rect inside <defs> and other functional containers', () => {
    const result = normalizeSvg(
      '<svg viewBox="0 0 100 100"><defs><clipPath id="c"><rect width="100" height="100"/></clipPath></defs><g clip-path="url(#c)"><circle cx="50" cy="50" r="10" fill="#F59E0B"/></g></svg>',
      { palette: PALETTE },
    );

    expect(result.removedBackgroundRects).toBe(0);
    expect(result.svg).toMatch(/<clipPath[\s\S]*<(rect|path)\b/);
  });

  it('leaves fully transparent colors alone', () => {
    const result = normalizeSvg(
      '<svg viewBox="0 0 100 100"><path fill="#FFFFFF00" d="M0 0h10v10z"/></svg>',
      { palette: PALETTE },
    );

    expect(result.replacements).toEqual([]);
    expect(result.svg.toLowerCase()).not.toContain('#f4f1ea');
  });

  it('uses the caller palette when it is not the style preset', () => {
    const result = normalizeSvg(BACKGROUND_AND_SUBJECT, {
      palette: ['#00FF00'],
    });

    expect(result.replacements[0]).toMatchObject({
      from: '#F59E0A',
      to: '#00FF00',
    });
  });

  it('reads a viewBox without rewriting the document', () => {
    expect(
      readSvgViewBox('<svg viewBox="0 0 256 256"><circle r="1"/></svg>'),
    ).toEqual({ minX: 0, minY: 0, width: 256, height: 256 });
    expect(readSvgViewBox('<svg width="64" height="32"></svg>')).toEqual({
      minX: 0,
      minY: 0,
      width: 64,
      height: 32,
    });
    expect(readSvgViewBox('<div></div>')).toBeNull();
  });
});
