/**
 * Tolerant JSON from a model answer.
 *
 * A model sometimes appends a sentence after the object ("…вот схема. Если
 * нужно, могу…"), and strict `JSON.parse` throws on text that carries no
 * meaning for the scene. The first balanced object or array in the answer is
 * the answer; the rest is commentary and is cut.
 */

function firstBalanced(text: string): string | null {
  const start = text.search(/[[{]/);

  if (start < 0) {
    return null;
  }

  const open = text[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;

      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

/** Throws the original parse error when no JSON value can be recovered. */
export function parseJsonResponse(raw: string): unknown {
  const trimmed = raw.trim();

  try {
    return JSON.parse(trimmed);
  } catch (strictError: unknown) {
    const balanced = firstBalanced(trimmed);

    if (balanced === null) {
      throw strictError;
    }

    try {
      return JSON.parse(balanced);
    } catch {
      throw strictError;
    }
  }
}
