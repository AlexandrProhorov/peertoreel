import type { Script } from '@peertoreel/contracts';

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'with',
  'in',
  'on',
  'at',
  'to',
  'for',
  'from',
  'by',
  'as',
  'into',
  'over',
  'under',
  'is',
  'are',
  'be',
  'this',
  'that',
  'these',
  'those',
  'his',
  'her',
  'their',
  'our',
  'your',
  'my',
  'it',
  'its',
  'they',
  'he',
  'she',
  'we',
  'you',
  'i',
  'not',
  'no',
  'very',
  'more',
  'most',
  'less',
  'least',
  'close',
  'closeup',
  'slow',
  'fast',
  'cinematic',
  'footage',
  'video',
  'stock',
  'background',
]);

export function tokenizeVisualText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/** Tokens that must appear in Pixabay tags for an asset to match the anchor. */
export function anchorTokens(anchor: string | null | undefined): string[] {
  return anchor ? [...new Set(tokenizeVisualText(anchor))] : [];
}

interface Gram {
  count: number;
  size: number;
}

/**
 * The explicit script field wins. Older scripts have no anchor, so use the
 * most repeated unigram/bigram in the beat directions. For the dog topic every
 * beat says "dog", so the derived anchor is "dog".
 */
export function deriveVisualAnchor(script: Script): string | null {
  const explicit = script.visualAnchor?.trim();

  if (explicit) {
    return explicit;
  }

  const directions = script.beats.map((beat) => beat.visualDirection);

  if (directions.length === 0) {
    return null;
  }

  const grams = new Map<string, Gram>();

  for (const direction of directions) {
    const tokens = tokenizeVisualText(direction);
    const seen = new Set<string>();

    for (const token of tokens) {
      seen.add(token);
    }

    for (let index = 0; index < tokens.length - 1; index += 1) {
      const bigram = `${tokens[index]} ${tokens[index + 1] ?? ''}`.trim();

      if (bigram.length > 0) {
        seen.add(bigram);
      }
    }

    for (const gram of seen) {
      const size = gram.includes(' ') ? 2 : 1;
      const current = grams.get(gram) ?? { count: 0, size };
      current.count += 1;
      grams.set(gram, current);
    }
  }

  const minCount = Math.max(2, Math.ceil(directions.length / 2));
  const candidates = [...grams.entries()]
    .filter(([, gram]) => gram.count >= minCount)
    .sort(([leftKey, left], [rightKey, right]) => {
      if (left.size !== right.size) {
        return right.size - left.size;
      }

      if (left.count !== right.count) {
        return right.count - left.count;
      }

      return leftKey.localeCompare(rightKey);
    });

  return candidates[0]?.[0] ?? null;
}
