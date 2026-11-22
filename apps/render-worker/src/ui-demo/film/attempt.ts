import type { SpecScene } from '../spec.js';

/**
 * The director answers with one scene. `speech` and `captions` are produced by
 * the voice stage, not by the model вЂ” a malformed copy of them must not cost an
 * attempt (one scene in the 2026-11-23 series lost four attempts to that).
 */
export function sceneOnlyAttempt(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return raw;
  }

  const record = raw as Record<string, unknown>;

  if (!Array.isArray(record['scenes'])) {
    return raw;
  }

  const { speech: _speech, captions: _captions, ...rest } = record;

  return { ...rest, scenes: record['scenes'].slice(0, 1) };
}

/** Primitives that implement the `highlight` transition. */
const HIGHLIGHT_PRIMITIVES: ReadonlySet<string> = new Set(['label', 'card']);

/**
 * A scene whose cues all fire before the 35 % mark renders two identical
 * frames, so the gate calls it static. Instead of degrading it, add one late
 * highlight on a text element that supports it: the picture changes between
 * 35 % and 90 %, and the composition stays the model's own.
 */
export function addLateAction(
  scene: SpecScene,
  seconds: number,
): SpecScene | null {
  const edge = seconds * 0.35;
  const late = scene.spec.sequence.some(
    (step) => (step.at ?? 0) >= edge && (step.at ?? 0) <= seconds * 0.9,
  );

  if (late) {
    return null;
  }

  const candidates = scene.spec.elements.filter((element) =>
    HIGHLIGHT_PRIMITIVES.has(element.primitive),
  );
  const target =
    candidates.find((element) => element.id === scene.thesisIds?.[0]) ??
    candidates[candidates.length - 1];

  if (target === undefined) {
    return null;
  }

  return {
    ...scene,
    spec: {
      ...scene.spec,
      sequence: [
        ...scene.spec.sequence,
        {
          element: target.id,
          transition: 'highlight',
          at: Number((seconds * 0.55).toFixed(2)),
        },
      ],
    },
  };
}

