import { describe, expect, it } from 'vitest';
import type { SpecScene } from '../spec.js';
import {
  alignSceneToLines,
  fragmentIndex,
  matchSceneLines,
  normalizeSceneWords,
  sceneLineMismatch,
  sceneTextElements,
} from './scene-lines.js';
import type { SpokenWord } from './voice.js';

/**
 * The screen shows the thesis of a line, verbatim from it. These tests hold the
 * audit and the word-level placement to that rule.
 */

function textElement(id: string, text: string, _at: number) {
  return {
    id,
    primitive: 'label',
    layout: { x: 72, y: 200, width: 818, height: 200 },
    params: { text },
    states: [],
    transitions: [],
    operations: [],
    links: [],
  } as const;
}

function scene(
  elements: readonly ReturnType<typeof textElement>[],
  sequence: readonly { element: string; transition: string; at?: number }[],
): SpecScene {
  return {
    id: 'thesis-scene',
    device: 'spec',
    durationSec: 7,
    revealSec: 2,
    spec: {
      kind: 'composition',
      elements: elements.map((element) => ({ ...element, states: [...element.states], transitions: [...element.transitions], operations: [...element.operations], links: [...element.links] })),
      sequence: sequence.map((step) => ({ ...step })),
    },
  };
}

const lines = [
  'Исходя из всех наших разговоров, назови пять вещей обо мне.',
  'В том же чате спроси, какие закономерности я вижу.',
];

function wordsOf(text: string, step = 0.3): SpokenWord[] {
  return normalizeSceneWords(text).map((word, index) => ({
    word,
    start: Number((index * step).toFixed(3)),
    end: Number(((index + 1) * step).toFixed(3)),
  }));
}

describe('the screen carries the thesis of a line', () => {
  it('finds a verbatim fragment and its word position', () => {
    expect(fragmentIndex(['иду', 'в', 'тот', 'же', 'чат'], ['тот', 'же'])).toBe(2);
    expect(fragmentIndex(['иду', 'в', 'тот', 'же', 'чат'], ['в', 'чат'])).toBeNull();
  });

  it('matches a short thesis inside a longer line', () => {
    const target = scene(
      [textElement('thesis', 'всех наших разговоров', 0)],
      [{ element: 'thesis', transition: 'appear', at: 0 }],
    );
    const result = matchSceneLines(target, [lines[0] ?? '']);

    expect(result.problem).toBeNull();
    expect(result.matches[0]).toMatchObject({ lineIndex: 0, wordIndex: 2 });
  });

  it('keeps the narration order and allows one thesis per line', () => {
    const target = scene(
      [
        textElement('second', 'какие закономерности я вижу', 4),
        textElement('first', 'всех наших разговоров', 0),
      ],
      [
        { element: 'first', transition: 'appear', at: 0 },
        { element: 'second', transition: 'appear', at: 4 },
      ],
    );
    const result = matchSceneLines(target, lines);

    expect(result.problem).toBeNull();
    expect(result.matches.map((match) => match.lineIndex)).toEqual([0, 1]);
  });

  it('rejects a line without a thesis on screen', () => {
    const target = scene(
      [textElement('first', 'всех наших разговоров', 0)],
      [{ element: 'first', transition: 'appear', at: 0 }],
    );

    expect(matchSceneLines(target, lines).problem).toContain('строка 2');
  });

  it('allows short service labels and rejects an invented sentence', () => {
    const withHint = scene(
      [
        textElement('first', 'всех наших разговоров', 0),
        textElement('hint', 'промпт 1', 1),
        textElement('second', 'какие закономерности я вижу', 4),
      ],
      [
        { element: 'first', transition: 'appear', at: 0 },
        { element: 'hint', transition: 'appear', at: 1 },
        { element: 'second', transition: 'appear', at: 4 },
      ],
    );

    expect(sceneLineMismatch(withHint, lines)).toBeNull();

    const invented = scene(
      [
        textElement('first', 'всех наших разговоров', 0),
        textElement('bad', 'полная стоимость покупки без скидки', 1),
        textElement('second', 'какие закономерности я вижу', 4),
      ],
      [
        { element: 'first', transition: 'appear', at: 0 },
        { element: 'bad', transition: 'appear', at: 1 },
        { element: 'second', transition: 'appear', at: 4 },
      ],
    );

    expect(sceneLineMismatch(invented, lines)).toContain('лишний текст');
  });

  it('reads text elements in cue order, not in declaration order', () => {
    const target = scene(
      [
        textElement('second', 'какие закономерности я вижу', 4),
        textElement('first', 'всех наших разговоров', 0),
      ],
      [
        { element: 'first', transition: 'appear', at: 0 },
        { element: 'second', transition: 'appear', at: 4 },
      ],
    );

    expect(sceneTextElements(target).map((element) => element.id)).toEqual([
      'first',
      'second',
    ]);
  });
});

describe('the voice step places the thesis on its own words', () => {
  it('starts the thesis when its first word is spoken', () => {
    const target = scene(
      [textElement('thesis', 'всех наших разговоров', 0)],
      [{ element: 'thesis', transition: 'appear', at: 0 }],
    );
    const cues = [{ text: lines[0] ?? '', startSec: 1 }];
    const words = [wordsOf(lines[0] ?? '')];
    const aligned = alignSceneToLines(target, cues, words);

    expect(aligned.aligned).toBe(true);
    /* "все" is the third word (0.6 s at 0.3 s per word), so 1 + 0.6. */
    expect(
      aligned.scene.spec.sequence.find((step) => step.element === 'thesis')?.at,
    ).toBe(1.6);
    expect(aligned.scene.spec.elements[0]?.params['text']).toBe(
      'всех наших разговоров',
    );
    expect(aligned.scene.thesisIds).toEqual(['thesis']);
  });

  it('starts a whole-line element at the line start', () => {
    const target = scene(
      [textElement('whole', lines[1] ?? '', 0)],
      [{ element: 'whole', transition: 'appear', at: 0 }],
    );
    const cues = [{ text: lines[1] ?? '', startSec: 5 }];
    const aligned = alignSceneToLines(target, cues, [wordsOf(lines[1] ?? '')]);

    expect(aligned.aligned).toBe(true);
    expect(
      aligned.scene.spec.sequence.find((step) => step.element === 'whole')?.at,
    ).toBe(5);
  });

  it('adds a reveal when the model forgot to show the thesis', () => {
    const target = scene(
      [textElement('thesis', 'всех наших разговоров', 0)],
      [],
    );
    const aligned = alignSceneToLines(
      target,
      [{ text: lines[0] ?? '', startSec: 0 }],
      [wordsOf(lines[0] ?? '')],
    );

    expect(aligned.scene.spec.sequence).toContainEqual({
      element: 'thesis',
      transition: 'appear',
      at: 0.6,
    });
  });

  it('aligns a fallback label even when later lines have no element', () => {
    const target = scene(
      [textElement('first', 'всех наших разговоров', 0)],
      [{ element: 'first', transition: 'appear', at: 0 }],
    );
    const aligned = alignSceneToLines(
      target,
      lines.map((text) => ({ text, startSec: 0 })),
      lines.map((line) => wordsOf(line)),
      { requireAll: false },
    );

    expect(aligned.aligned).toBe(true);
    expect(aligned.scene.thesisIds).toEqual(['first']);
  });

  it('leaves the scene alone when a line has no thesis', () => {
    const original = scene(
      [textElement('first', 'всех наших разговоров', 0)],
      [{ element: 'first', transition: 'appear', at: 0 }],
    );
    const aligned = alignSceneToLines(
      original,
      lines.map((text) => ({ text, startSec: 0 })),
      lines.map((line) => wordsOf(line)),
    );

    expect(aligned.aligned).toBe(false);
    expect(aligned.scene).toBe(original);
  });

  it('starts the typed words when the line is spoken, not a second later', () => {
    const target = scene(
      [textElement('thesis', 'всех наших разговоров', 0)],
      [
        { element: 'thesis', transition: 'appear', at: 0 },
        { element: 'thesis', transition: 'type', at: 1.04 },
      ],
    );
    const aligned = alignSceneToLines(
      target,
      [{ text: lines[0] ?? '', startSec: 0 }],
      [wordsOf(lines[0] ?? '')],
    );
    const steps = aligned.scene.spec.sequence
      .filter((step) => step.element === 'thesis')
      .map((step) => [step.transition, step.at]);

    /* The thesis begins on "все" (0.6 s), and the typing starts there too. */
    expect(steps).toEqual([
      ['appear', 0.6],
      ['type', 0.6],
    ]);
  });

  it('delays a type step that started before its own line', () => {
    const target = scene(
      [
        textElement('first', 'всех наших разговоров', 0),
        textElement('second', lines[1] ?? '', 0),
      ],
      [
        { element: 'first', transition: 'appear', at: 0 },
        { element: 'second', transition: 'appear', at: 0 },
        { element: 'second', transition: 'type', at: 0 },
      ],
    );
    const cues = lines.map((text, index) => ({
      text,
      startSec: index === 0 ? 0 : 5,
    }));
    const aligned = alignSceneToLines(target, cues, lines.map((line) => wordsOf(line)));
    const second = aligned.scene.spec.sequence.find(
      (step) => step.element === 'second' && step.transition === 'type',
    );
    const first = aligned.scene.spec.sequence.find(
      (step) => step.element === 'first' && step.transition === 'appear',
    );

    expect(second?.at).toBe(5);
    /* The other element still lands on its own words ("все" at 0.6 s). */
    expect(first?.at).toBe(0.6);
  });

  it('keeps the rhythm of the steps that follow the first typed one', () => {
    const target = scene(
      [textElement('thesis', lines[0] ?? '', 0)],
      [
        { element: 'thesis', transition: 'appear', at: 0 },
        { element: 'thesis', transition: 'type', at: 2 },
        { element: 'thesis', transition: 'highlight', at: 3 },
      ],
    );
    const aligned = alignSceneToLines(
      target,
      [{ text: lines[0] ?? '', startSec: 1 }],
      [wordsOf(lines[0] ?? '')],
    );
    const steps = aligned.scene.spec.sequence
      .filter((step) => step.element === 'thesis')
      .map((step) => [step.transition, step.at]);

    expect(steps).toEqual([
      ['appear', 1],
      ['type', 1],
      ['highlight', 2],
    ]);
  });
});
