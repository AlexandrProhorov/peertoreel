import { describe, expect, it } from 'vitest';
import { behaviorStyle } from './motion.js';

/**
 * Motion cues are owned nudges: one cue moves its element once, the end state
 * stays, and the amplitude is capped so a scene cannot push text out of frame.
 */
describe('motion cues', () => {
  it('moves up by 24px and keeps the end state', () => {
    expect(behaviorStyle('move', 0).transform).toBe('translateY(0px)');
    expect(behaviorStyle('move', 1).transform).toBe('translateY(-24px)');
  });

  it('scales by six percent at most', () => {
    expect(behaviorStyle('scale', 1).transform).toBe('scale(1.06)');
  });

  it('flashes a highlight and returns to normal', () => {
    expect(behaviorStyle('highlight', 0).filter).toBe('brightness(1)');
    expect(behaviorStyle('highlight', 0.5).filter).toBe('brightness(1.35)');
    expect(behaviorStyle('highlight', 1).filter).toBe('brightness(1)');
  });

  it('keeps entrances owning opacity', () => {
    expect(behaviorStyle('appear', 0).opacity).toBe(0);
    expect(behaviorStyle('hold', 0.5)).toEqual({});
  });

  it('answers a press with a visible pulse that returns to rest', () => {
    expect(behaviorStyle('activate', 0)).toEqual({
      transform: 'scale(1.0000)',
      filter: 'brightness(1.0000)',
    });
    expect(behaviorStyle('activate', 0.5)).toEqual({
      transform: 'scale(1.0200)',
      filter: 'brightness(1.2000)',
    });
    expect(behaviorStyle('activate', 1)).toEqual({
      transform: 'scale(1.0000)',
      filter: 'brightness(1.0000)',
    });
  });
});
