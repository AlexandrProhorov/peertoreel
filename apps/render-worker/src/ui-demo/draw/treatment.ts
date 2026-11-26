import { z } from 'zod';
import { UI_THEME_IDS } from '../themes.js';

/**
 * Treatment: the whole film in one document.
 *
 * The model writes the story, not the frame: one central device that changes
 * from beat to beat, narrative functions, the spoken line, and the text plan —
 * which words the viewer reads, split into setup / punchline / number.
 *
 * The plan owns the copy; the drawing stage only places it.
 */

export const TEXT_ROLES = ['setup', 'punchline', 'question', 'number', 'label'] as const;
export type TextRole = (typeof TEXT_ROLES)[number];

export const SCENE_FUNCTIONS = [
  'setup',
  'escalation',
  'proof',
  'counterexample',
  'turn',
  'cost',
  'resolution',
  'cta',
] as const;
export type SceneFunction = (typeof SCENE_FUNCTIONS)[number];

export const textBeatSchema = z.object({
  /** A verbatim fragment of `narration`, in order. */
  text: z.string().min(1).max(120),
  role: z.enum(TEXT_ROLES),
});

export const treatmentSceneSchema = z.object({
  id: z.string().min(1).max(24),
  function: z.enum(SCENE_FUNCTIONS),
  /** carrier — the thought lives on a surface; statement — the thought is the frame. */
  frame: z.enum(['carrier', 'statement']),
  intent: z.string().min(1).max(200),
  narration: z.string().min(1).max(220),
  seconds: z.number().min(3).max(10),
  theme: z.enum(UI_THEME_IDS),
  texts: z.array(textBeatSchema).min(1).max(3),
});

export const treatmentSchema = z.object({
  thesis: z.string().min(1).max(300),
  /** The central image the film evolves; invented by the model. */
  device: z.string().min(1).max(200),
  scenes: z.array(treatmentSceneSchema).min(5).max(10),
});

export type TextBeat = z.infer<typeof textBeatSchema>;
export type TreatmentScene = z.infer<typeof treatmentSceneSchema>;
export type Treatment = z.infer<typeof treatmentSchema>;

export const TREATMENT_SYSTEM = `Ты — сценарист вертикального ролика. Это не кино: зритель смотрит на телефон 4–8 секунд на кадр.

Напиши историю на весь фильм, а не набор фактов. Одна мысль и один центральный образ: что меняется от кадра к кадру. Образ придумай сам; не перечисляй предметы и приёмы.

7–9 сцен. У каждой:
- function: setup | escalation | proof | counterexample | turn | cost | resolution | cta;
- frame: carrier (мысль показана через поверхность) или statement (мысль сама в кадре);
- narration: 8–16 слов, 1–2 коротких предложения; это речь голоса, без описания кадра;
- texts: 1–3 дословных фрагмента narration, по порядку. Роль: setup | punchline | question | number | label.
  * number — только с цифрой;
  * если в реплике есть поворот (тире, «но», «однако», «а»), раздели её на setup и punchline;
  * не сокращай фрагмент посреди фразы.
- seconds: 4–8; theme: studio-dark | studio-light | studio-lime.

Правила истории:
- не больше двух carrier подряд; минимум четверть кадров — statement;
- в середине — turn: он меняет смысл, а не добавляет ещё один факт;
- финал — cost, resolution или cta;
- каждая следующая сцена отвечает на вопрос, который оставила предыдущая.

Ответ — только JSON, по-русски:
{
  "thesis": "<мысль фильма одной фразой>",
  "device": "<центральный образ и как он меняется>",
  "scenes": [
    {
      "id": "hook", "function": "setup", "frame": "statement",
      "intent": "...", "narration": "...", "seconds": 5, "theme": "studio-dark",
      "texts": [{ "text": "...", "role": "setup" }]
    }
  ]
}`;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/gu, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Keep only verbatim, ordered fragments. A fragment that is paraphrased or out
 * of order is dropped; if nothing survives, the line is split into sentences and
 * the first becomes the setup, the rest the punchline.
 */
export function normalizeTexts(
  narration: string,
  texts: readonly TextBeat[],
): { texts: TextBeat[]; fixes: string[] } {
  const fixes: string[] = [];
  const source = narration.toLowerCase();
  const kept: TextBeat[] = [];
  let cursor = 0;

  for (const [index, beat] of texts.entries()) {
    const needle = beat.text.trim().toLowerCase();
    const at = needle === '' ? -1 : source.indexOf(needle, cursor);

    if (at < 0) {
      fixes.push(`text-dropped:${String(index + 1)}`);
      continue;
    }

    const role = beat.role === 'number' && !/\d/u.test(beat.text) ? 'setup' : beat.role;

    kept.push({ text: beat.text.trim(), role });
    cursor = at + needle.length;
  }

  if (kept.length > 0) {
    return { texts: kept, fixes };
  }

  const sentences = narration
    .split(/(?<=[.!?…])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '');

  if (sentences.length >= 2) {
    return {
      texts: [
        { text: sentences[0] ?? narration.trim(), role: 'setup' as const },
        { text: sentences.slice(1).join(' '), role: 'punchline' as const },
      ],
      fixes: [...fixes, 'texts-from-sentences'],
    };
  }

  return {
    texts: [{ text: narration.trim(), role: 'setup' as const }],
    fixes: [...fixes, 'texts-single'],
  };
}

/** At least one statement per four frames, and never three carriers in a row. */
export function planFrames(scenes: readonly TreatmentScene[]): {
  frames: ('carrier' | 'statement')[];
  adjusted: number[];
} {
  const frames = scenes.map((scene) => scene.frame);
  const adjusted: number[] = [];

  const set = (index: number, frame: 'carrier' | 'statement'): void => {
    if (frames[index] !== frame) {
      frames[index] = frame;
      adjusted.push(index + 1);
    }
  };

  for (let index = 2; index < frames.length; index += 1) {
    if (
      frames[index] === 'carrier' &&
      frames[index - 1] === 'carrier' &&
      frames[index - 2] === 'carrier'
    ) {
      set(index - 1, 'statement');
    }
  }

  const needed = Math.ceil(frames.length / 4);
  let statements = frames.filter((frame) => frame === 'statement').length;

  for (let index = 1; index < frames.length && statements < needed; index += 2) {
    if (frames[index] === 'carrier') {
      set(index, 'statement');
      statements += 1;
    }
  }

  return { frames, adjusted };
}

export function normalizeTreatment(treatment: Treatment): {
  treatment: Treatment;
  fixes: string[];
} {
  const fixes: string[] = [];
  const frames = planFrames(treatment.scenes);
  const scenes = treatment.scenes.map((scene, index) => {
    const normalized = normalizeTexts(scene.narration, scene.texts);

    fixes.push(...normalized.fixes.map((fix) => `${scene.id}:${fix}`));

    return {
      ...scene,
      frame: frames.frames[index] ?? scene.frame,
      texts: normalized.texts,
    };
  });

  return {
    treatment: { ...treatment, scenes },
    fixes,
  };
}

export { normalizeText as normalizeTreatmentText };
