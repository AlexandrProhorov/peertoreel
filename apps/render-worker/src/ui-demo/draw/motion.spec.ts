import { describe, expect, it } from 'vitest';
import { motionWindow, nodeMotion, nodeStarts, tickText } from './motion.js';

const FPS = 30;
const DURATION = 4;

function motion(
  transition: Parameters<typeof nodeMotion>[0]['transition'],
  frame: number,
  extra: Partial<Parameters<typeof nodeMotion>[0]> = {},
): ReturnType<typeof nodeMotion> {
  return nodeMotion({
    transition,
    at: 0,
    frame,
    fps: FPS,
    durationSec: DURATION,
    ...extra,
  });
}

describe('draw motion: window', () => {
  it('keeps the assembly in the first 45 % of the scene', () => {
    expect(motionWindow(DURATION)).toBeCloseTo(1.8);
    expect(motionWindow(1)).toBeCloseTo(0.45);
  });

  it('a narrated node may start after the assembly window', () => {
    expect(motion('appear', 72, { at: 3 }).opacity).toBe(0);
    expect(motion('appear', 102, { at: 3 }).opacity).toBe(1);
  });
});

describe('draw motion: transitions', () => {
  it('appear fades the node in', () => {
    expect(motion('appear', 0).opacity).toBe(0);
    expect(motion('appear', 4).opacity).toBeGreaterThan(0.4);
    expect(motion('appear', 10).opacity).toBe(1);
  });

  it('slide arrives from below', () => {
    expect(motion('slide', 0).offsetY).toBe(72);
    expect(motion('slide', 5).offsetY).toBeGreaterThan(0);
    expect(motion('slide', 11).offsetY).toBe(0);
  });

  it('type reveals a prefix and keeps the rest of the line', () => {
    const reveal = motion('type', 4, { text: 'Хлеб — 120 ₽' });

    expect(reveal.text.length).toBeGreaterThan(0);
    expect(reveal.text.length).toBeLessThan('Хлеб — 120 ₽'.length);
    expect('Хлеб — 120 ₽'.startsWith(reveal.text)).toBe(true);
    expect(motion('type', 60, { text: 'Хлеб — 120 ₽' }).text).toBe('Хлеб — 120 ₽');
  });

  it('print shows children one by one, then all of them', () => {
    expect(motion('print', 0, { childCount: 4 }).childCount).toBe(0);
    expect(motion('print', 12, { childCount: 4 }).childCount).toBe(2);
    expect(motion('print', 40, { childCount: 4 }).childCount).toBe(4);
  });

  it('draw shortens the line from its end', () => {
    expect(motion('draw', 0).drawn).toBe(0);
    expect(motion('draw', 8).drawn).toBeGreaterThan(0);
    expect(motion('draw', 30).drawn).toBe(1);
  });

  it('tick steps through the value and lands on the model number', () => {
    expect(motion('tick', 0, { text: '365' }).text).toBe('91');
    expect(motion('tick', 30, { text: '365' }).text).toBe('219');
    expect(motion('tick', 60, { text: '365' }).text).toBe('365');
  });
});

describe('draw motion: tick text', () => {
  it('keeps the surrounding words', () => {
    expect(tickText('+15 мин', 1)).toBe('+15 мин');
    expect(tickText('670 ₽', 1)).toBe('670 ₽');
  });

  it('leaves a line without digits alone', () => {
    expect(tickText('Дней подписки', 1)).toBe('Дней подписки');
  });
});

describe('draw motion: steps', () => {
  it('collects nested starts inside the window', () => {
    expect(
      nodeStarts(
        [
          { at: 0.2, children: [{ at: 0.9 }, { at: 5 }] },
          { at: 0.2 },
          {},
        ],
        DURATION,
      ),
    ).toEqual([0.2, 0.9, 1.8]);
  });
});
