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
  seconds: z.number().min(1).max(12),
  theme: z.enum(['studio-dark', 'studio-light', 'studio-lime']),
});

export const arcSchema = z
  .object({
    /** The through-line of the film in one sentence. */
    thesis: z.string().min(1).max(300),
    scenes: z.array(arcSceneSchema).min(3).max(5),
  })
  .refine(
    (arc) => {
      const total = arc.scenes.reduce((sum, scene) => sum + scene.seconds, 0);

      return total >= 24 && total <= 32;
    },
    {
      message:
        'фильм должен длиться 25–30 секунд: сумма seconds по сценам вне 24..32',
    },
  );

export type Arc = z.infer<typeof arcSchema>;
export type ArcScene = z.infer<typeof arcSceneSchema>;

export const ARC_SYSTEM_PROMPT = [
  'Ты режиссёр вертикального ролика на 25–30 секунд. Ты придумываешь его арку,',
  'а не отдельные картинки.',
  '',
  'Ролик объясняет одну мысль за 3–5 сцен. Каждая сцена делает один шаг:',
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
  '- крючок короткий (1–2 с), доказательство и поворот длиннее;',
  '- чередуй темы кадра, чтобы фильм не выглядел одним слайдом;',
  '- весь текст на экране по-русски, без выдуманных фактов и цифр.',
  '',
  'Ответ — только JSON, без markdown.',
].join('\n');

export function buildArcPrompt(
  topic: string,
  options: { readonly action?: boolean; readonly form?: string; readonly carrier?: string } = {},
): string {
  const themes = Object.keys(UI_THEMES).join(', ');
  const withAction = options.action !== false;
  const skeleton = withAction
    ? '{ "id": "hook", "role": "<роль>", "action": "<визуальное действие>", "intent": "<что зритель поймёт>", "seconds": <число>, "theme": "<тема>" }'
    : '{ "id": "hook", "role": "<роль>", "intent": "<что зритель поймёт>", "seconds": <число>, "theme": "<тема>" }';

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
    '- от 3 до 5 сцен;',
    '- сумма seconds по всем сценам — от 25 до 30; посчитай её перед ответом;',
    '- durations — твой выбор: крючок короткий, доказательство и поворот длинные;',
    '- id латиницей, до 12 символов, уникальные;',
    `- theme — одна из: ${themes};`,
    '- intent — одна фраза, без описания картинки.',
  ].join('\n');
}
