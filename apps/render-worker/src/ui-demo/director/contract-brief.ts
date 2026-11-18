import {
  MAX_ELEMENTS_PER_SCENE,
  MAX_INSTANCES_PER_PRIMITIVE,
} from '../catalog.js';
import {
  buildGalleryCatalog,
  FORBIDDEN_PRIMITIVES,
  PRIMITIVE_SEMANTICS,
} from '../gallery/catalog.js';
import { CRITICAL_SAFE_BOUNDS, CANVAS } from '../platform.js';
import { UI_THEMES } from '../themes.js';
import { TYPE_BOX_RULES } from '../typography-rules.js';
import { TYPE_SCALE, type TypeToken } from '../typography.js';

/**
 * Prompt construction. Three layers, each with one owner:
 *
 * A. technical contract — generated from `catalog.ts`, never hand-written;
 * B. semantics — what each primitive is for, short;
 * C. direction — what makes a scene a scene; the only part that is prose.
 *
 * A rule lives in code or here, never in both: the validator is the source of
 * truth for what is rejected, the prompt only has to say what is wanted.
 */

/* The prompt and the web gallery read one description: see `gallery/catalog.ts`. */
export { FORBIDDEN_PRIMITIVES, PRIMITIVE_SEMANTICS };

/** Layer A + B: what exists, and what it is for — exactly what the gallery shows. */
export function buildContractBrief(): string {
  return buildGalleryCatalog()
    .primitives.filter((primitive) => primitive.offeredToDirector)
    .map((primitive) => primitive.prompt.join('\n'))
    .join('\n');
}

/** Typography: every token in the scale, generated from code. */
export function buildTypographyBrief(): string {
  return (Object.keys(TYPE_SCALE) as TypeToken[])
    .map((token) => {
      const rule = TYPE_BOX_RULES[token];

      return `- ${token} (${TYPE_SCALE[token].fontSize}px): бокс ${rule.minHeight}..${rule.maxHeight}px`;
    })
    .join('\n');
}

function themeLines(): string {
  return Object.values(UI_THEMES)
    .map(
      (theme) =>
        `- ${theme.id}: фон ${theme.background}, текст ${theme.ink}, вторичный ${theme.muted}, ` +
        `поверхность ${theme.surface}, акцент ${theme.accent}, текст на акценте ${theme.accentInk}`,
    )
    .join('\n');
}

export const DIRECTOR_SYSTEM_PROMPT = [
  'Ты режиссёр вертикальных коротких видео. По теме ты придумываешь одну сцену на 5–8 секунд',
  'и описываешь её исполнимой схемой. Ты отвечаешь за мысль и за визуальное решение;',
  'за границы допустимого отвечает код, который проверит твой ответ.',
  '',
  'Перед схемой реши три вопроса (в ответ их выносить не нужно):',
  '1. Что зритель должен понять? Одна фраза.',
  '2. Какое одно действие это передаёт? Рост, разрушение, вытеснение, объединение,',
  '   перегрузка, потеря равновесия, перемещение, трансформация.',
  '3. Что изменилось к концу? Состояние до и состояние после.',
  '',
  'Как устроена хорошая сцена:',
  '- одна сцена — одна мысль; если действий два, это две сцены;',
  '- сцена меняется во времени: исходное состояние, действие, читаемый результат;',
  '  статичный заголовок с украшениями — не сцена;',
  '- каждый элемент участвует в действии: объект, причина, контекст или результат;',
  '  элемент без роли убирается;',
  '- композиция следует за мыслью: асимметрия, крупный объект, пересечения и пустота',
  '  уместны, если усиливают смысл; заполнять области ради правила не нужно;',
  '- формальные приёмы (списки, нумерованные карточки, крестики, ряды одинаковых блоков)',
  '  берутся только тогда, когда их требует тема;',
  '- средства подбираются под действие, а не наоборот: если идея держится на двух',
  '  элементах, ставь два.',
  '',
  'Ответ — только JSON-объект, без markdown и пояснений. Весь текст на экране по-русски,',
  'короткий, без выдуманных фактов и цифр.',
].join('\n');

export interface UserPromptOptions {
  /** Target scene length in seconds; defaults to the 5–8 s single-scene mode. */
  readonly seconds?: number;
  /** Theme picked by the arc, so one scene does not restate the palette. */
  readonly themeId?: string;
  /** Lines prepended above the task: where this scene sits in the film. */
  readonly context?: readonly string[];
}

export function buildUserPrompt(
  topic: string,
  options: UserPromptOptions = {},
): string {
  const safe = CRITICAL_SAFE_BOUNDS;
  const length =
    options.seconds === undefined
      ? '5..8'
      : String(Math.max(1, options.seconds));
  const theme = options.themeId ?? '<любая тема из списка ниже>';

  return [
    ...(options.context === undefined ? [] : [...options.context, '']),
    `Тема: ${topic}`,
    '',
    'Форма ответа (поля с фиксированными значениями оставь как есть):',
    `{
  "schemaVersion": 1,
  "themeId": "${theme}",
  "captions": false,
  "speech": [],
  "scenes": [
    {
      "id": "<латиницей, до 24 символов>",
      "device": "spec",
      "durationSec": <${length}>,  
      "revealSec": 2,
      "themeId": "${theme}",
      "spec": {
        "kind": "composition",
        "elements": [
          { "id": "a", "primitive": "label", "layout": { "x": 72, "y": 400, "width": 818, "height": 140 },
            "params": { "text": "текст", "token": "headline", "tone": "ink", "weight": 800 },
            "states": [], "transitions": [], "operations": [], "links": [] }
        ],
        "sequence": [
          { "element": "a", "transition": "appear" },
          { "element": "a", "transition": "type" }
        ]
      }
    }
  ]
}`,
    '',
    'Жёсткие границы (их проверяет код):',
    `- ровно одна сцена, device всегда "spec", длительность ${length} секунд;`,
    `- от 2 до ${MAX_ELEMENTS_PER_SCENE} элементов, не больше ${MAX_INSTANCES_PER_PRIMITIVE} экземпляров одного примитива;`,
    '- первым элементом всегда stage с фоном выбранной темы;',
    '- текст живёт только в label, pill и bubble, остальные — форма и поверхность;',
    `- важный текст и объекты: x ${safe.left}..${safe.right}, y ${safe.top}..${safe.bottom}; кадр ${CANVAS.width}×${CANVAS.height};`,
    '- в sequence указывается переход (событие: appear, disappear, move, scale, draw, type…),',
    '  а не операция. Операции описывают, что элемент умеет, и в sequence не пишутся;',
    '- переход обязан быть в списке переходов этого примитива; hold есть только у текстовых',
    '  элементов (label, pill, bubble) и у card — им меняют текст и состояние без анимации;',
    '- sequence — упорядоченный список шагов: что происходит и в каком порядке;',
    '  секунды не указывай, время считает код; порядок в списке = хронология;',
    '- сцена должна развиваться: начальное и конечное состояние различаются, иначе она',
    '  отклоняется — но меняться должен минимум элементов, а не все;',
    '- статичные элементы — норма: неподвижный объект держит кадр, пока меняется другой;',
    '- средства подбираются под действие: если примитив не умеет нужного перехода —',
    '  смени примитив, а не действие;',
    '- нужен один крупный токен — display, headline, card или selection: главный смысл;',
    '- нужен один акцент: поверхность или заливка цвета акцента темы; акцентный текст',
    '  допустим только на тёмном фоне — на светлом он не читается и будет отклонён;',
    '- поверхность (card, pill, bubble) должна отличаться от фона темы, иначе её не видно.',
    '',
    'Примитивы: назначение и технические параметры',
    buildContractBrief(),
    '',
    'Типографика: размер шрифта определяется высотой бокса',
    buildTypographyBrief(),
    '- мелкий токен в высоком боксе — такая же ошибка, как крупный в низком;',
    '- ширину текста не угадывай: пиши коротко, переносы делает рендерер.',
    '',
    'Темы:',
    themeLines(),
  ].join('\n');
}
