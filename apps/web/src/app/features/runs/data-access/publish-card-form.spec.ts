import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import {
  fromDateTimeLocal,
  hashtagsValidator,
  parseHashtagsInput,
  publishText,
  toDateTimeLocal,
  toHashtagsInput,
} from './publish-card-form';

describe('publish card form helpers', () => {
  it('splits hashtags on commas, spaces and new lines', () => {
    expect(parseHashtagsInput('#собаки, #породы\nщенки   #2026')).toEqual([
      'собаки',
      'породы',
      'щенки',
      '2026',
    ]);
    expect(parseHashtagsInput('   ')).toEqual([]);
  });

  it('renders hashtags back into the input', () => {
    expect(toHashtagsInput(['собаки', 'породы'])).toBe('#собаки #породы');
    expect(toHashtagsInput([])).toBe('');
  });

  it('validates the number and the format of hashtags', () => {
    expect(hashtagsValidator(new FormControl('', { nonNullable: true }))).toBeNull();
    expect(hashtagsValidator(new FormControl('#собаки #породы', { nonNullable: true }))).toBeNull();
    expect(hashtagsValidator(new FormControl('two words here', { nonNullable: true }))).toBeNull();
    expect(hashtagsValidator(new FormControl('bad tag!', { nonNullable: true }))).toEqual({
      hashtagFormat: true,
    });

    const many = Array.from({ length: 31 }, (_, index) => `tag${index}`).join(' ');

    expect(hashtagsValidator(new FormControl(many, { nonNullable: true }))).toEqual({
      hashtagsCount: true,
    });
  });

  it('round-trips a local date-time value', () => {
    const local = '2026-11-07T09:30';
    const iso = fromDateTimeLocal(local);

    expect(iso).not.toBeNull();
    expect(toDateTimeLocal(iso)).toBe(local);
    expect(toDateTimeLocal(null)).toBe('');
    expect(toDateTimeLocal('not a date')).toBe('');
    expect(fromDateTimeLocal('')).toBeNull();
    expect(fromDateTimeLocal('not a date')).toBeNull();
  });

  it('builds the caption for the clipboard', () => {
    expect(
      publishText({ title: 'Топ пород', hashtags: ['пород', 'собак'] }),
    ).toBe('Топ пород\n\n#пород #собак');
    expect(publishText({ title: 'Только заголовок', hashtags: [] })).toBe(
      'Только заголовок',
    );
  });
});

