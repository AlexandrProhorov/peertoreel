import { describe, expect, it } from 'vitest';
import { estimateLines } from './text-metrics.js';

describe('text metrics: line estimate', () => {
  it('breaks a headline into words instead of dividing the total width', () => {
    expect(estimateLines('Мелкий шрифт всё решает', 500, 72)).toBeGreaterThan(1);
  });

  it('keeps a one-word line at one line', () => {
    expect(estimateLines('Мелкий', 500, 72)).toBe(1);
  });

  it('counts the lines of a word that cannot break', () => {
    expect(estimateLines('Суперкалифраджилистик', 200, 72)).toBeGreaterThan(1);
  });
});
