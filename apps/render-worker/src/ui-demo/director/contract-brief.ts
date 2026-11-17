import {
  MAX_ELEMENTS_PER_SCENE,
  MAX_INSTANCES_PER_PRIMITIVE,
  PRIMITIVES,
} from '../catalog.js';
import { CRITICAL_SAFE_BOUNDS, CANVAS } from '../platform.js';
import { UI_THEMES } from '../themes.js';
import { TYPE_BOX_RULES } from '../typography-rules.js';

const typeRules = TYPE_BOX_RULES;

/**
 * The contract text handed to the model is generated from the same catalogue the
 * renderer validates against. A prompt that drifts from code is worse than no
 * prompt: it teaches the model rules nobody enforces.
 */

/** Assets need a key from the local library; a director cannot invent one. */
const FORBIDDEN_PRIMITIVES = ['avatar', 'object'] as const;

function parameterLine(name: string, parameter: {
  type: string;
  min?: number;
  max?: number;
  values?: readonly (string | number)[];
  maxLength?: number;
}): string {
  const parts = [parameter.type];

  if (parameter.min !== undefined || parameter.max !== undefined) {
    parts.push(`range ${parameter.min ?? '*'}..${parameter.max ?? '*'}`);
  }

  if (parameter.values !== undefined) {
    parts.push(`one of ${JSON.stringify(parameter.values)}`);
  }

  if (parameter.maxLength !== undefined) {
    parts.push(`max ${parameter.maxLength} chars`);
  }

  return `${name}: ${parts.join(', ')}`;
}

function primitiveLines(): string[] {
  return Object.entries(PRIMITIVES)
    .filter(([id]) => !(FORBIDDEN_PRIMITIVES as readonly string[]).includes(id))
    .map(([id, contract]) => {
      const params = Object.entries(contract.parameters)
        .map(([name, parameter]) => `    - ${parameterLine(name, parameter)}`)
        .join('\n');

      return [
        `- ${id}`,
        params,
        `    transitions: ${contract.transitions.join(', ')}`,
        `    states: ${contract.states.join(', ')}`,
        `    operations: ${contract.operations.join(', ')}`,
      ].join('\n');
    });
}

function themeLines(): string[] {
  return Object.values(UI_THEMES).map(
    (theme) =>
      `- ${theme.id}: background ${theme.background}, ink ${theme.ink}, muted ${theme.muted}, ` +
      `surface ${theme.surface}, accent ${theme.accent}, accentInk ${theme.accentInk}`,
  );
}

export function buildContractBrief(): string {
  const safe = CRITICAL_SAFE_BOUNDS;

  return [
    `Кадр ${CANVAS.width}×${CANVAS.height}, 30 fps, вертикаль.`,
    `Текст и важные элементы живут в прямоугольнике x ${safe.left}..${safe.right}, y ${safe.top}..${safe.bottom}.`,
    `Не больше ${MAX_ELEMENTS_PER_SCENE} элементов в сцене и ${MAX_INSTANCES_PER_PRIMITIVE} экземпляров одного примитива.`,
    '',
    'Примитивы и их параметры:',
    ...primitiveLines(),
    '',
    'Темы (выбери одну):',
    ...themeLines(),
  ].join('\n');
}

export const DIRECTOR_SYSTEM_PROMPT = [
  'Ты режиссёр вертикальных коротких видео и одновременно верстальщик.',
  'По теме придумай ОДНУ сцену на 5–8 секунд и опиши её исполнимой схемой.',
  'Ответ — только JSON-объект, без markdown и без пояснений.',
  'Весь текст на экране — по-русски, короткий, без выдуманных фактов и цифр.',
  'Сцена должна читаться без звука: смысл несут композиция и движение, а не подпись.',
  'Не повторяй одну и ту же раскладку для разных тем: выбирай пространственное решение из смысла темы.',
].join(' ');

export function buildUserPrompt(topic: string): string {
  return [
    `Тема: ${topic}`,
    '',
    'Верни JSON строго такой формы:',
    `{
  "schemaVersion": 1,
  "themeId": "<id темы>",
  "captions": false,
  "speech": [],
  "scenes": [
    {
      "id": "<латиницей, до 24 символов>",
      "device": "spec",
      "durationSec": <5..8>,
      "revealSec": 2,
      "themeId": "<id темы>",
      "spec": {
        "kind": "composition",
        "elements": [
          { "id": "...", "primitive": "...", "layout": { "x": 72, "y": 400, "width": 818, "height": 120, "align": "left" },
            "params": { }, "states": [], "transitions": [], "operations": [], "links": [] }
        ],
        "sequence": [
          { "at": 0.2, "element": "...", "transition": "appear" },
          { "at": 2.4, "element": "...", "transition": "hold", "text": "новый текст" }
        ]
      }
    }
  ]
}`,
    '',
    'Правила, которые проверяет валидатор (нарушение = отказ):',    '- ровно одна сцена, device всегда "spec";',
    '- 2..6 элементов; текст только в label, pill, bubble;',
    '- у каждой label и bubble обязательны params.token и params.tone; у каждой pill обязательны params.token и params.textColor;',
    '- нужен хотя бы один крупный токен: display, headline, card или selection;',
    '- нужен акцент: tone "accent" или цвет, равный accent темы;',
    '- нужна видимая поверхность: stage/card/pill/bubble с params.background; stage ставится с id "stage", layout {x:0,y:0};',
    '- text элемента не длиннее 80 символов, layout не выходит из безопасного прямоугольника;',
    '- transitions/operations/params — только из списка выше, иначе отказ;',
    '- sequence: at в секундах, по возрастанию, меньше durationSec; реплика может нести text (счётчики, суммы);',
    '- примитивы avatar и object недоступны.',
    '',
    'Пространство кадра:',
    '- по горизонтали три области — левая, центральная, правая; по вертикали — верхняя, средняя, нижняя;',
    '- занимай осмысленно минимум две разные области, а не только левый верх;',
    '- крупный объект может занимать несколько областей и пересекать их;',
    '- асимметрия разрешена и приветствуется, если она несёт смысл: пустая половина кадра — тоже решение, но не по умолчанию;',
    '- это подсказка о пространстве, а не сетка шаблонов: раскладку придумываешь ты.',
    '',
    'Правило типографики (размер шрифта определяется боксом, а не наоборот):',
    `- display: бокс по высоте ${typeRules.display?.minHeight}..${typeRules.display?.maxHeight}px`,
    `- headline: ${typeRules.headline?.minHeight}..${typeRules.headline?.maxHeight}px`,
    `- card: ${typeRules.card?.minHeight}..${typeRules.card?.maxHeight}px`,
    `- body: ${typeRules.body?.minHeight}..${typeRules.body?.maxHeight}px`,
    `- caption: ${typeRules.caption?.minHeight}..${typeRules.caption?.maxHeight}px`,
    `- label: ${typeRules.label?.minHeight}..${typeRules.label?.maxHeight}px`,
    '- в высоком блоке ставь крупный токен: мелкий текст в большом блоке — ошибка;',
    '- не угадывай ширину текста: пиши коротко, переносы делает рендерер,',
    '',
    buildContractBrief(),
  ].join('\n');
}
