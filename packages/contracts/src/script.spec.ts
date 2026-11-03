import { describe, expect, it } from 'vitest';
import {
  scriptPlannedDurationSec,
  scriptSchema,
  scriptSpeechText,
  type Script,
} from './script.js';

const script: Script = {
  title: 'Почему небо синее',
  hook: 'Небо не синее.',
  beats: [
    { text: 'Свет — это волны разной длины.', visualDirection: 'sunlight through air', durationSec: 5 },
    { text: 'Короткие волны рассеиваются сильнее.', visualDirection: 'blue particles scattering', durationSec: 6 },
  ],
  cta: 'Подпишись, чтобы знать больше.',
};

describe('script contracts', () => {
  it('accepts a valid script', () => {
    expect(scriptSchema.safeParse(script).success).toBe(true);
  });

  it('rejects a script without beats', () => {
    expect(scriptSchema.safeParse({ ...script, beats: [] }).success).toBe(false);
  });

  it('rejects a beat without visual direction', () => {
    const beats = [{ text: 'Текст', durationSec: 5 }];

    expect(scriptSchema.safeParse({ ...script, beats }).success).toBe(false);
  });

  it('joins hook, beats and CTA into one speech text', () => {
    expect(scriptSpeechText(script)).toBe(
      'Небо не синее. Свет — это волны разной длины. Короткие волны рассеиваются сильнее. Подпишись, чтобы знать больше.',
    );
  });

  it('sums the planned duration', () => {
    expect(scriptPlannedDurationSec(script)).toBe(17);
  });
});
