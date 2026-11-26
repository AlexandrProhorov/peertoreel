import type { LineCue, SpokenWord } from '../film/voice.js';
import type { UiScene } from '../spec.js';
import type { DrawNode, DrawText } from './schema.js';

type DrawScene = Extract<UiScene, { device: 'draw' }>;
type MutText = { -readonly [K in keyof DrawText]: DrawText[K] };

/**
 * The spoken line places its screen text. Each narration cue owns one text node
 * whose text is a verbatim piece of the line; the node appears at the estimated
 * start of the fragment's first word, not at a fixed beat. The node's place and
 * size are planned by the frame (see `bandIssues`), so this step only sets time.
 *
 * Google has no alignment, so the start inside a line uses its estimated words;
 * the line start itself is exact (each line is synthesized separately).
 */

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/gu, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function wordsOf(value: string): string[] {
  return normalizeText(value).split(/\s+/u).filter((word) => word !== '');
}

interface TextRef {
  readonly node: MutText;
  readonly normal: string;
}

function collectTexts(nodes: readonly DrawNode[]): TextRef[] {
  const texts: TextRef[] = [];

  const walk = (list: readonly DrawNode[]): void => {
    for (const node of list) {
      if (node.kind === 'text') {
        texts.push({ node: node as MutText, normal: normalizeText(node.text) });
      }

      if (node.kind === 'box' && node.children !== undefined) {
        walk(node.children);
      }
    }
  };

  walk(nodes);

  return texts;
}

/** Clone the tree so the episode keeps the model's scene and the aligned one is new. */
function cloneNodes(nodes: readonly DrawNode[]): DrawNode[] {
  return structuredClone(nodes) as DrawNode[];
}

export interface DrawAlignment {
  readonly scene: DrawScene;
  readonly aligned: boolean;
  readonly reasons: string[];
}

export function alignDrawToLines(
  scene: DrawScene,
  cues: readonly LineCue[],
  lineWords: readonly SpokenWord[][],
): DrawAlignment {  const nodes = cloneNodes(scene.nodes);
  const texts = collectTexts(nodes);
  const used = new Set<MutText>();
  const reasons: string[] = [];

  for (const [index, cue] of cues.entries()) {
    const line = normalizeText(cue.text);
    /* One drawn block may carry the whole sentence while the voice splits it
       into cues: the block matches its first cue and starts with it. */
    const candidate = texts.find(
      (text) =>
        !used.has(text.node) &&
        text.normal !== '' &&
        (line.includes(text.normal) || text.normal.includes(line)),
    );

    if (candidate === undefined) {
      reasons.push(`line ${String(index + 1)}: no text element carries the line`);
      continue;
    }

    used.add(candidate.node);

    const words = lineWords[index] ?? [];
    const first = wordsOf(candidate.node.text)[0];
    const word = words.find((entry) => normalizeText(entry.word) === first);

    candidate.node.at =
      word === undefined
        ? Number(cue.startSec.toFixed(3))
        : Number((cue.startSec + word.start).toFixed(3));
    /* The reference types the line in: it reads as narration, not as a title. */
    candidate.node.transition = 'type';
  }

  return {
    scene: { ...scene, nodes },
    aligned: reasons.length === 0,
    reasons,
  };
}

/**
 * The planned text beats are timed by their own first word: a setup reads when
 * its words start, a punchline after the pause, a number when it is spoken.
 */
export function alignTextBeats(
  scene: DrawScene,
  words: readonly SpokenWord[],
): DrawAlignment {
  const beats = scene.textBeats ?? [];
  const nodes = cloneNodes(scene.nodes);
  const top = nodes.filter((node): node is MutText => node.kind === 'text');
  const used = new Set<MutText>();
  const reasons: string[] = [];
  let cursor = 0;

  for (const beat of beats) {
    const needle = normalizeText(beat.text);
    const candidate = top.find(
      (node) => !used.has(node) && normalizeText(node.text).includes(needle),
    );

    if (candidate === undefined) {
      reasons.push(`beat «${beat.text.slice(0, 24)}»: no text element`);
      continue;
    }

    used.add(candidate);

    const first = wordsOf(beat.text)[0];
    let at = 0;

    if (first !== undefined) {
      const index = words.findIndex(
        (entry, position) => position >= cursor && normalizeText(entry.word) === first,
      );

      if (index >= 0) {
        at = words[index]?.start ?? 0;
        cursor = index + 1;
      }
    }

    candidate.at = Number(at.toFixed(3));
    candidate.transition = beat.role === 'number' ? 'tick' : 'type';
  }

  return {
    scene: { ...scene, nodes },
    aligned: reasons.length === 0,
    reasons,
  };
}
