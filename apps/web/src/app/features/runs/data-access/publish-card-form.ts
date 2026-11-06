import type { AbstractControl, ValidationErrors } from '@angular/forms';
import {
  PUBLISH_HASHTAGS_MAX,
  formatHashtags,
  hashtagSchema,
} from '@kadence/contracts';

/**
 * Accepts comma- and/or space-separated input, with or without `#`.
 * The server normalizes again; this only prepares the request payload.
 */
export function parseHashtagsInput(value: string): string[] {
  return value
    .split(/[\s,]+/u)
    .map((item) => item.replace(/^#+/, '').trim())
    .filter((item) => item.length > 0);
}

export function toHashtagsInput(hashtags: readonly string[]): string {
  return hashtags.map((hashtag) => `#${hashtag}`).join(' ');
}

export function hashtagsValidator(
  control: AbstractControl<string>,
): ValidationErrors | null {
  const hashtags = parseHashtagsInput(control.value);

  if (hashtags.length > PUBLISH_HASHTAGS_MAX) {
    return { hashtagsCount: true };
  }

  return hashtags.every((hashtag) => hashtagSchema.safeParse(hashtag).success)
    ? null
    : { hashtagFormat: true };
}

/** ISO → value for `<input type="datetime-local">` in the local timezone. */
export function toDateTimeLocal(iso: string | null): string {
  if (!iso) {
    return '';
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (value: number): string => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `<input type="datetime-local">` (local time) → ISO, or null when empty. */
export function fromDateTimeLocal(value: string): string | null {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const date = new Date(trimmed);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Clipboard text: the caption the user pastes into TikTok. */
export function publishText(card: {
  title: string;
  hashtags: readonly string[];
}): string {
  return [card.title.trim(), formatHashtags(card.hashtags)]
    .filter((part) => part.length > 0)
    .join('\n\n');
}
