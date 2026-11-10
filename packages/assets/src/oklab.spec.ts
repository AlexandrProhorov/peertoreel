import { STYLE_PRESETS } from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import {
  hexToOklab,
  nearestPaletteColor,
  oklabDistance,
  oklabToRgb,
  parseHexColor,
  rgbToHex,
  rgbToOklab,
} from './oklab.js';

const PALETTE = STYLE_PRESETS.studio_flat_2d_v1.assetPalette;

describe('hex parsing', () => {
  it('parses #rgb, #rrggbb and #rrggbbaa', () => {
    expect(parseHexColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHexColor('#F59E0B')).toEqual({ r: 245, g: 158, b: 11 });
    expect(parseHexColor('#F59E0B80')).toEqual({ r: 245, g: 158, b: 11 });
    expect(parseHexColor('not-a-color')).toBeNull();
  });

  it('round-trips RGB through OKLab within a small error', () => {
    for (const value of ['#0B1220', '#F4F1EA', '#F59E0B', '#38BDF8', '#EF4444']) {
      const rgb = parseHexColor(value);

      if (rgb === null) {
        throw new Error(`expected ${value} to parse`);
      }

      const roundTrip = oklabToRgb(rgbToOklab(rgb));

      expect(rgbToHex(roundTrip)).toBe(value.toUpperCase());
    }
  });
});

describe('OKLab palette quantization', () => {
  it('maps an exact palette color to itself with zero error', () => {
    const match = nearestPaletteColor('#F59E0B', PALETTE);

    expect(match).toEqual({ color: '#F59E0B', distance: 0 });
  });

  it('snaps a near color to the closest palette slot with a measurable error', () => {
    const match = nearestPaletteColor('#F59E0A', PALETTE);

    if (match === null) {
      throw new Error('expected a palette match');
    }

    expect(match.color).toBe('#F59E0B');
    expect(match.distance).toBeGreaterThanOrEqual(0);
    expect(match.distance).toBeLessThan(0.01);
  });

  it('always returns a palette color for arbitrary input', () => {
    const inputs = ['#FFD166', '#123456', '#abcdef', '#000000', '#ffffff'];
    const paletteUpper = PALETTE.map((color) => color.toUpperCase());

    for (const input of inputs) {
      const match = nearestPaletteColor(input, PALETTE);
      const source = hexToOklab(input);

      if (match === null || source === null) {
        throw new Error(`expected a match for ${input}`);
      }

      expect(paletteUpper).toContain(match.color);

      const chosen = hexToOklab(match.color);

      if (chosen === null) {
        throw new Error('expected the palette color to parse');
      }

      expect(match.distance).toBeCloseTo(oklabDistance(source, chosen), 10);
    }
  });

  it('breaks ties towards the earlier palette entry', () => {
    const palette = ['#000000', '#000000', '#ffffff'];
    const match = nearestPaletteColor('#000000', palette);

    expect(match?.color).toBe('#000000');
  });

  it('returns null for an empty palette or an invalid color', () => {
    expect(nearestPaletteColor('#123456', [])).toBeNull();
    expect(nearestPaletteColor('teal', PALETTE)).toBeNull();
  });
});
