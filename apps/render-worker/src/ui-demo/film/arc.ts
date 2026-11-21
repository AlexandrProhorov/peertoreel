import { z } from 'zod';
import { UI_THEMES } from '../themes.js';

/**
 * Phase 1: the arc. One short call decides what the film is made of, before any
 * layout exists. Retrying a scene later must not change the plan, otherwise
 * every retry rewrites the whole film.
 */

export const arcSceneSchema = z.object({
  id: z.string().min(1).max(24),
  /** What this scene does for the story: hook, evidence, turn, conclusion. */
  role: z.string().min(1).max(40),
  /**
   * The visual action, chosen before any primitive: accumulation, loss,
   * competition, split, transformation, comparison, disappearance…
   * The model describes it in a sentence or two; a hard 200 cut the direction.
   */
  action: z.string().min(1).max(600).optional(),
  /** One sentence the viewer must understand after this scene. */
  intent: z.string().min(1).max(300),
  /** What the voiceover says over this scene. Spoken, not read: one or two sentences. */
  narration: z.string().min(1).max(400),
  seconds: z.number().min(1).max(12),
  theme: z.enum(['studio-dark', 'studio-light', 'studio-lime']),
});

/** Default film length; a longer film is requested explicitly. */
export const ARC_DEFAULT_WINDOW = { min: 24, max: 32 } as const;

const arcBase = z.object({
  /** The through-line of the film in one sentence. */
  thesis: z.string().min(1).max(300),
  /* The window is checked against the requested length in the CLI: one schema
     cannot carry both a 25-second pilot and a minute-long film. */
  scenes: z.array(arcSceneSchema).min(3).max(12),
});

export type Arc = z.infer<typeof arcBase>;
export type ArcScene = z.infer<typeof arcSceneSchema>;

/** Seconds window and scene count for a requested film length. */
export function arcPlanFor(seconds: number): {
  seconds: { min: number; max: number };
  scenes: { min: number; max: number };
} {
  const min = Math.round(seconds * 0.92);
  const max = Math.round(seconds * 1.08);
  const middle = Math.min(12, Math.max(3, Math.round(seconds / 6.5)));

  return {
    seconds: { min, max },
    scenes: { min: Math.max(3, middle - 1), max: Math.min(12, middle + 1) },
  };
}

export function arcSchemaFor(window: { readonly min: number; readonly max: number }) {
  return arcBase.refine(
    (arc) => {
      const total = arc.scenes.reduce((sum, scene) => sum + scene.seconds, 0);

      return total >= window.min && total <= window.max;
    },
    {
      message: `фильм должен длиться ${window.min}–${window.max} секунд: сумма seconds по сценам вне окна`,
    },
  );
}

export const arcSchema = arcSchemaFor(ARC_DEFAULT_WINDOW);

export const ARC_SYSTEM_PROMPT = [
  'Ты режиссёр вертикального ролика. Ты придумываешь его арку, а не отдельные картинки.',
  '',
  'Ролик объясняет одну мысль за несколько сцен. Каждая сцена делает один шаг:',
  'крючок (зачем смотреть), доказательство (покажи, а не назови), поворот',
  '(что меняется в понимании), вывод.',
  '',
  'Для каждой сцены сначала назови ВИЗУАЛЬНОЕ ДЕЙСТВИЕ — что происходит на экране,',
  'без единого примитива: накопление, потеря, конкуренция за место, разделение на части,',
  'трансформация, сравнение двух состояний, исчезновение, столкновение. Это может быть',
  'любое действие; список — примеры, а не меню.',
  '',
  'Правила арки:',
  '- мысль фильма формулируется одной фразой; если не формулируется — тема не понята;',
  '- действие выбирается из смысла, а не из того, что уже умеет рендерер;',
  '- разные сцены не повторяют одно и то же действие;',
  '- сцена не повторяет предыдущую другими словами: каждая добавляет новое;',
  '- крючок короткий, доказательство и поворот длиннее;',
  '- narration — то, что произносит голос за эту сцену: живая речь, одно-два предложения,',
  '  без описания картинки и без служебных слов вроде «на экране»;',
  '- чередуй темы кадра, чтобы фильм не выглядел одним слайдом;',
  '- весь текст на экране и в narration по-русски, без выдуманных фактов и цифр.',
  '',
  'Ответ — только JSON, без markdown.',
].join('\n');

export function buildArcPrompt(
  topic: string,
  options: {
    readonly action?: boolean;
    readonly form?: string;
    readonly carrier?: string;
    /** Requested film length in seconds; the default is the 25–30 s pilot. */
    readonly seconds?: number;
  } = {},
): string {
  const themes = Object.keys(UI_THEMES).join(', ');
  const withAction = options.action !== false;
  const plan =
    options.seconds === undefined
      ? { seconds: ARC_DEFAULT_WINDOW, scenes: { min: 3, max: 5 } }
      : arcPlanFor(options.seconds);
  const skeleton = withAction
    ? '{ "id": "hook", "role": "<роль>", "action": "<визуальное действие>", "intent": "<что зритель поймёт>", "narration": "<что произносит голос>", "seconds": <число>, "theme": "<тема>" }'
    : '{ "id": "hook", "role": "<роль>", "intent": "<что зритель поймёт>", "narration": "<что произносит голос>", "seconds": <число>, "theme": "<тема>" }';

  return [
    `Тема: ${topic}`,
    '',
    ...(options.form === undefined ? [] : [`Драматургическая форма: ${options.form}.`]),
    ...(options.carrier === undefined
      ? []
      : [`Носитель величины: ${options.carrier} — через него показывай «больше/меньше».`]),
    '',
    'Верни JSON строго такой формы:',
    `{
  "thesis": "<мысль фильма одной фразой>",
  "scenes": [
    ${skeleton}
  ]
}`,
    '',
    'Жёсткие границы:',
    `- от ${plan.scenes.min} до ${plan.scenes.max} сцен;`,
    `- сумма seconds по всем сценам — от ${plan.seconds.min} до ${plan.seconds.max}; посчитай её перед ответом;`,
    '- durations — твой выбор: крючок короткий, доказательство и поворот длинные;',
    '- id латиницей, до 12 символов, уникальные;',
    `- theme — одна из: ${themes};`,
    '- intent — одна фраза, без описания картинки;',
    '- narration — речь голоса, её произнесут вслух за эту сцену;',
    '- narration — примерно 2.2 слова в секунду: для сцены в 7 секунд около 15 слов.',
  ].join('\n');
}
