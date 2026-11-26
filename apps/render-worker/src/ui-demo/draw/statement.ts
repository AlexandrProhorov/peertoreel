import { ZONES, type Zone } from './carrier.js';
import type { DrawNode } from './schema.js';
import type { TextBeat, TreatmentScene } from './treatment.js';

/**
 * A statement frame is typographic: the text beats are the picture. The code
 * places each beat in its own zone, so a setup and its punchline appear in
 * different parts of the frame instead of one block at the bottom.
 */

const PREFERRED: Readonly<Record<TextBeat['role'], readonly Zone[]>> = {
  number: ['top', 'middle', 'bottom'],
  setup: ['middle', 'top', 'bottom'],
  punchline: ['bottom', 'middle', 'top'],
  question: ['middle', 'top', 'bottom'],
  label: ['top', 'middle', 'bottom'],
};

export function statementSlots(
  scene: TreatmentScene,
): { index: number; zone: Zone }[] {
  const used = new Set<Zone>();

  return scene.texts.map((beat, index) => {
    const zone =
      PREFERRED[beat.role].find((candidate) => !used.has(candidate)) ?? 'bottom';

    used.add(zone);

    return { index, zone };
  });
}

function tokenFor(beat: TextBeat): 'display' | 'headline' | 'card' | 'caption' {
  if (beat.role === 'number') {
    return 'display';
  }

  if (beat.role === 'label') {
    return 'caption';
  }

  return beat.text.length <= 40 ? 'headline' : 'card';
}

export function composeStatement(scene: TreatmentScene): {
  nodes: DrawNode[];
  slots: { index: number; zone: Zone }[];
} {
  const slots = statementSlots(scene);
  const nodes: DrawNode[] = [];
  const numberIndex = scene.texts.findIndex((beat) => beat.role === 'number');

  /* The number gets a plate behind it; the plate is painted first. */
  if (numberIndex >= 0) {
    const zone = slots.find((slot) => slot.index === numberIndex)?.zone ?? 'top';
    const range = ZONES[zone];

    nodes.push({
      kind: 'box',
      x: 72,
      y: range.top,
      w: 818,
      h: 340,
      r: 40,
      fill: 'surface',
    });
  }

  for (const [index, beat] of scene.texts.entries()) {
    const zone = slots.find((slot) => slot.index === index)?.zone ?? 'bottom';
    const range = ZONES[zone];
    const isNumber = beat.role === 'number';

    nodes.push({
      kind: 'text',
      x: 72,
      y: range.top + (isNumber ? 90 : 16),
      w: 818,
      text: beat.text,
      token: tokenFor(beat),
      align: 'center',
      color: 'ink',
      at: 0,
      transition: isNumber ? 'tick' : 'type',
    });
  }

  return { nodes, slots };
}
