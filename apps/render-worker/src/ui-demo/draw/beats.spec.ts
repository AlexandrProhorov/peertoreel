import { describe, expect, it } from 'vitest';
import { composeInterlude, interludeAccent, planBeats } from './beats.js';

describe('story beats: rhythm', () => {
  it('opens with a question and closes with a pause', () => {
    const { beats, adjusted } = planBeats(['moment', 'moment', 'moment']);

    expect(beats[0]).toBe('question');
    expect(beats[beats.length - 1]).not.toBe('moment');
    expect(adjusted.length).toBeGreaterThan(0);
  });

  it('never leaves three carriers in a row', () => {
    const { beats } = planBeats(['moment', 'moment', 'moment', 'moment', 'moment']);

    for (let index = 2; index < beats.length; index += 1) {
      expect(beats.slice(index - 2, index + 1).every((beat) => beat === 'moment')).toBe(false);
    }
  });

  it('keeps at least one pause per three frames', () => {
    const { beats } = planBeats(['moment', 'moment', 'moment', 'moment', 'moment', 'moment']);
    const pauses = beats.filter((beat) => beat !== 'moment').length;

    expect(pauses).toBeGreaterThanOrEqual(Math.ceil(beats.length / 3));
  });
});

describe('story beats: composition', () => {
  it('takes a number from the line as the hero', () => {
    expect(interludeAccent('number', 'Итого: 2 148 ₽')).toBe('2 148 ₽');
    expect(interludeAccent('question', 'А как это остановить?')).toBe('?');
  });

  it('puts the line in the reserved band and the accent above it', () => {
    const nodes = composeInterlude({ kind: 'number', line: 'Итого: 2 148 ₽' });
    const box = nodes[0];
    const accent = nodes[1];
    const line = nodes[2];

    expect(box).toMatchObject({ kind: 'box', y: 260, h: 520 });
    expect(accent).toMatchObject({ kind: 'text', text: '2 148 ₽', token: 'display' });
    expect(line).toMatchObject({ kind: 'text', y: 1300, transition: 'type' });
  });
});
