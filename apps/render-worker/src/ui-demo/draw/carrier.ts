import { z } from 'zod';
import { CRITICAL_SAFE_BOUNDS } from '../platform.js';
import { TYPE_SCALE, type TypeToken } from '../typography.js';
import type { DrawNode, DrawText } from './schema.js';
import { estimateLines } from './text-metrics.js';
import type { TreatmentScene } from './treatment.js';

/**
 * Where a text beat lives. Three vertical zones; the carrier takes only the
 * zones that no text beat owns, so the text is designed into the frame instead
 * of being laid over it.
 */
export const ZONES = {
  top: { top: 80, bottom: 560 },
  middle: { top: 600, bottom: 1080 },
  bottom: { top: 1120, bottom: 1600 },
} as const;

export type Zone = keyof typeof ZONES;
const ZONE_TOLERANCE = 24;

export const carrierSchema = z.object({
  carrier: z.object({
    what: z.string().min(1).max(160),
    parts: z
      .array(
        z.object({
          part: z.string().min(1).max(80),
          detail: z.string().min(1).max(200),
          text: z.string().max(40).optional(),
        }),
      )
      .min(3)
      .max(4),
  }),
  elements: z
    .array(
      z.object({
        what: z.string().min(1).max(80),
        text: z.string().max(120).optional(),
        emphasis: z.enum(['main', 'support', 'detail']),
      }),
    )
    .min(2)
    .max(3),
  slots: z
    .array(
      z.object({
        index: z.number().int().min(0).max(2),
        zone: z.enum(['top', 'middle', 'bottom']),
      }),
    )
    .min(1)
    .max(3),
});

export type CarrierPlan = z.infer<typeof carrierSchema>;

export const CARRIER_SYSTEM = `Ты проектируешь один кадр вертикального ролика.

Это не кино: камеры нет, людей в действии нет, обстановки нет. В кадре только то, что можно нарисовать прямоугольником, текстом, эмодзи или линией.

Кадр делится на три вертикальные зоны: верх (y 80..560), середина (y 600..1080), низ (y 1120..1600). Текстовые биты сцены займут свои зоны — они придут отдельно, дословно. Ты раскладываешь только носитель и его части: они живут в свободных зонах и не заходят в зоны текста.

Придумай, через какую одну поверхность или вещь зритель прочитает мысль, и разбери её на 3–4 части. Текст на части — до 40 символов, это подписи носителя, а не экранный текст сцены.

Верни slots: для каждого текстового бита (index с нуля) укажи зону top | middle | bottom. Два бита не могут делить одну зону. Свободные зоны отдай носителю.

Ответ — только JSON, по-русски:
{
  "carrier": { "what": "...", "parts": [{ "part": "...", "detail": "...", "text": "..." }] },
  "elements": [{ "what": "...", "text": "...", "emphasis": "main|support|detail" }],
  "slots": [{ "index": 0, "zone": "top" }]
}`;

export function carrierUser(scene: TreatmentScene): string {
  const texts = scene.texts
    .map((beat, index) => `${String(index)}. [${beat.role}] «${beat.text}»`)
    .join('\n');

  return `Мысль сцены: ${scene.intent}
Реплика: ${scene.narration}

Текстовые биты (дословно, по порядку):
${texts}

Спроектируй носитель и разложи биты по зонам.`;
}

export function drawSystem(): string {
  return `Ты собираешь кадр вертикального ролика 1080×1920 из четырёх узлов.

Холст 1080×1920 — это и есть фон кадра. Рисуй прямо на нём; не оборачивай сцену в общий контейнер.

Узлы:
box — прямоугольник: x, y, w, h, r, rot (−45..45), fill, stroke, strokeWidth, shadow, clip, opacity; дети в координатах родителя.
text — строка: x, y, w, text, token (display|headline|card|body|caption), weight, align, color.
icon — эмодзи: x, y, size, emoji.
line — линия: x1, y1, x2, y2, width, dashed, color.

Как собирать:
- каждый текстовый бит стоит в своей зоне, крупно: number — display, setup и punchline — headline или card, question — headline, label — caption;
- носитель и его части — только в свободных зонах; ни один узел не пересекает зону текста;
- текст битов — дословно; не придумывай других надписей, кроме подписей частей;
- не подписывай объект его названием;
- стиль: плоская инфографика, без рваных краёв и мелких деталей; тень только у носителя;
- 3–8 верхнеуровневых узлов;
- числа не разрывай: «35 880 ₽» — одна строка;
- цвета: свой hex или роль темы (background, surface, surfaceInk, ink, muted, accent, accentInk);
- у узла может быть at (0..1.8) и transition (appear|type|print|draw|tick|slide).

Ответ — только JSON { "nodes": [ ... ] }, без markdown.`;
}

export function drawUser(scene: TreatmentScene, plan: CarrierPlan): string {
  const parts = plan.carrier.parts
    .map(
      (part) =>
        `- ${part.part}: ${part.detail}${part.text === undefined ? '' : ` — «${part.text}»`}`,
    )
    .join('\n');
  const texts = scene.texts
    .map((beat, index) => {
      const zone = plan.slots.find((slot) => slot.index === index)?.zone ?? 'bottom';
      const range = ZONES[zone];

      return `${String(index)}. [${beat.role}] y ${String(range.top)}..${String(range.bottom)} — «${beat.text}»`;
    })
    .join('\n');

  return `Носитель: ${plan.carrier.what}
Части:
${parts}

Элементы:
${JSON.stringify(plan.elements, null, 2)}

Текстовые биты:
${texts}`;
}

/** Text nodes with their paint depth. */
function collectTexts(
  nodes: readonly DrawNode[],
  depth = 0,
  out: { node: DrawText; normal: string; depth: number }[] = [],
): { node: DrawText; normal: string; depth: number }[] {
  for (const node of nodes) {
    if (node.kind === 'text') {
      out.push({ node, normal: normalize(node.text), depth });
    }

    if (node.kind === 'box' && node.children !== undefined) {
      collectTexts(node.children, depth + 1, out);
    }
  }

  return out;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/gu, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function textBottom(node: DrawText): number {
  const token =
    node.token !== undefined && node.token in TYPE_SCALE
      ? (node.token as TypeToken)
      : 'body';
  const style = TYPE_SCALE[token];
  const lines = estimateLines(node.text, node.w, style.fontSize);

  return node.y + lines * style.fontSize * style.lineHeight;
}

const ROLE_TOKENS: Readonly<Record<string, readonly string[]>> = {
  number: ['display', 'headline'],
  question: ['headline', 'card'],
  setup: ['headline', 'card'],
  punchline: ['headline', 'card'],
  label: ['caption', 'body'],
};

/**
 * The text plan is the contract: every beat stands on the canvas inside its own
 * zone, in a token that matches its role, and no carrier node crosses it.
 */
export function textPlanIssues(
  nodes: readonly DrawNode[],
  scene: TreatmentScene,
  slots: readonly { index: number; zone: Zone }[],
  options: { readonly overlay?: boolean } = {},
): string[] {
  const texts = collectTexts(nodes);
  const used = new Set<DrawText>();
  const issues: string[] = [];

  for (const [index, beat] of scene.texts.entries()) {
    const needle = normalize(beat.text);
    const found = texts.find(
      (text) => !used.has(text.node) && text.normal.includes(needle),
    );

    if (found === undefined) {
      issues.push(`нет текста бита ${String(index + 1)}: «${beat.text}»`);
      continue;
    }

    used.add(found.node);

    if (found.depth !== 0) {
      issues.push(`текст бита ${String(index + 1)} должен стоять на холсте, не внутри карточки`);
    }

    const zone = slots.find((slot) => slot.index === index)?.zone ?? 'bottom';
    const range = ZONES[zone];
    const bottom = textBottom(found.node);

    if (found.node.y < range.top - ZONE_TOLERANCE || bottom > range.bottom + ZONE_TOLERANCE) {
      issues.push(
        `бит ${String(index + 1)} должен стоять в зоне ${zone} (y ${String(range.top)}..${String(range.bottom)})`,
      );
    }

    const allowed = ROLE_TOKENS[beat.role] ?? ['headline', 'card'];

    if (!allowed.includes(found.node.token ?? 'body')) {
      issues.push(`бит ${String(index + 1)} — не мелкая подпись: ${allowed.join(' или ')}`);
    }
  }

  for (const [index, node] of nodes.entries()) {
    if (node.kind === 'text' && used.has(node)) {
      continue;
    }

    if (options.overlay === false) {
      continue;
    }

    const rect = {
      left: node.kind === 'line' ? Math.min(node.x1, node.x2) : node.x,
      right:
        node.kind === 'line'
          ? Math.max(node.x1, node.x2)
          : node.x + (node.kind === 'icon' ? node.size : node.w),
      top: node.kind === 'line' ? Math.min(node.y1, node.y2) : node.y,
      bottom:
        node.kind === 'line'
          ? Math.max(node.y1, node.y2)
          : node.kind === 'icon'
            ? node.y + node.size
            : node.kind === 'text'
              ? textBottom(node)
              : node.y + node.h,
    };

    for (const text of used) {
      const textIndex = nodes.indexOf(text);

      /* A surface painted before the text is a backdrop; only a later node can
         cover it. */
      if (textIndex < 0 || index < textIndex) {
        continue;
      }

      const textRect = {
        left: text.x,
        right: text.x + text.w,
        top: text.y,
        bottom: textBottom(text),
      };

      if (
        rect.left < textRect.right &&
        textRect.left < rect.right &&
        rect.top < textRect.bottom &&
        textRect.top < rect.bottom
      ) {
        issues.push(`носитель или декор пересекает текст «${text.text.slice(0, 24)}»`);
        return issues;
      }
    }
  }

  return issues;
}

/** A zone that is not taken by any text beat: the carrier lives there. */
export function freeZones(slots: readonly { zone: Zone }[]): Zone[] {
  const taken = new Set(slots.map((slot) => slot.zone));

  return (Object.keys(ZONES) as Zone[]).filter((zone) => !taken.has(zone));
}

export function missingSlots(scene: TreatmentScene, plan: CarrierPlan): string[] {
  const issues: string[] = [];

  for (const index of scene.texts.keys()) {
    if (!plan.slots.some((slot) => slot.index === index)) {
      issues.push(`нет зоны для бита ${String(index + 1)}`);
    }
  }

  const zones = plan.slots.map((slot) => slot.zone);

  if (new Set(zones).size !== zones.length) {
    issues.push('два бита делят одну зону');
  }

  return issues;
}

export const CARRIER_BOUNDS = CRITICAL_SAFE_BOUNDS;
