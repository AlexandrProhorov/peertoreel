import {
  InvalidAssetError,
  ProviderBudgetError,
  ProviderUnavailableError,
  type AssetKind,
  type ImageProvider,
  type ImageProviderRequest,
  type ImageProviderResult,
  type LlmJsonClient,
  type LlmJsonUsage,
  type ProviderUsageSink,
} from '@peertoreel/contracts';
import { z } from 'zod';
import { svgSize } from './mappers.js';

/**
 * DeepSeek SVG adapter (M3.6b.2).
 *
 * The model returns flat vector icons as a JSON `{svg}` document. The adapter
 * owns the geometric prompt, the allowlist gate, one corrective retry, and the
 * per-attempt provider ledger row — retries spend real tokens, so a skipped
 * attempt would understate the bill (root hard rule 7).
 *
 * `thinking` stays disabled and `max_tokens` is capped: the 2026-11-12 pilot
 * measured 2k–16k completion tokens with thinking on (~$0.0023 per candidate),
 * while the same model at 318/479 tokens costs ~$0.0003–0.0006.
 */

export const DEEPSEEK_SVG_PROVIDER_ID = 'deepseek-svg';
export { ProviderBudgetError };
export const DEEPSEEK_SVG_OPERATION = 'asset.svg.generate';
/** Tariffs are pinned to the official page on the date they were copied. */
export const DEEPSEEK_SVG_PRICE_REF =
  'https://api-docs.deepseek.com/quick_start/pricing/ (2026-11-11)';
export const DEEPSEEK_SVG_MAX_ATTEMPTS = 2;
export const DEEPSEEK_SVG_CANVAS = 400;
export const DEEPSEEK_SVG_MAX_BYTES = 200_000;
export const DEEPSEEK_SVG_MAX_ELEMENTS = 500;
export const DEEPSEEK_SVG_DEFAULT_MAX_USD_PER_CALL = 0.02;

export interface DeepSeekSvgRates {
  readonly inputUsdPerMtok: number;
  readonly outputUsdPerMtok: number;
}

/**
 * Deterministic failure lever for acceptance runs (`DEEPSEEK_SVG_FORCE_FAILURE`).
 * `unavailable` fails before any call (no spend); `empty` feeds an empty model
 * reply through the corrective retry (zero tokens, zero cost).
 */
export type DeepSeekSvgSimulatedFailure = 'unavailable' | 'empty';

export interface DeepSeekSvgProviderOptions {
  readonly apiKey?: string | null;
  readonly client?: LlmJsonClient;
  readonly model?: string;
  /** Token tariffs; required whenever the provider is enabled. */
  readonly rates?: DeepSeekSvgRates;
  readonly maxUsdPerCall?: number;
  readonly usageWriter?: ProviderUsageSink | null;
  /** Ledger `source` column: `cli` for the render CLI, `assets` elsewhere. */
  readonly usageSource?: string;
  readonly runId?: string | null;
  readonly maxAttempts?: number;
  /**
   * Reasoning mode. `enabled` produces precise coordinate plans (reference
   * geometry test) but bills 4–7× more completion tokens; A/B measured.
   */
  readonly thinking?: 'enabled' | 'disabled';
  /** Visible-output cap; thinking tokens are billed on top of it. */
  readonly maxTokens?: number;
  /** Dev/acceptance lever; unset in production. */
  readonly simulateFailure?: DeepSeekSvgSimulatedFailure | null;
}

const ALLOWED_ELEMENTS = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'polygon',
  'polyline',
]);

const ALLOWED_ATTRIBUTES = new Set([
  'xmlns',
  'viewBox',
  'x',
  'y',
  'width',
  'height',
  'rx',
  'ry',
  'cx',
  'cy',
  'r',
  'd',
  'points',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'fill-rule',
  'clip-rule',
  'transform',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
]);

const TAG_PATTERN = /<([a-zA-Z][\w:.-]*)((?:\s[^<>]*?)?)\s*\/?>/g;
const ATTRIBUTE_PATTERN = /([a-zA-Z_:][\w:.-]*)\s*=/g;
const FORBIDDEN_MARKUP = [
  '<!DOCTYPE',
  '<!ENTITY',
  'javascript:',
  'url(',
] as const;

const svgPayloadSchema = z.object({ svg: z.string().min(1) });

export interface DeepSeekSvgValidation {
  readonly ok: boolean;
  readonly reason: string | null;
}

/** Allowlist gate applied before `normalizeSvg`; never trusts the model. */
export function validateSvgDocument(svg: string): DeepSeekSvgValidation {
  if (Buffer.byteLength(svg, 'utf8') > DEEPSEEK_SVG_MAX_BYTES) {
    return {
      ok: false,
      reason: `SVG is larger than ${DEEPSEEK_SVG_MAX_BYTES} bytes`,
    };
  }

  for (const marker of FORBIDDEN_MARKUP) {
    if (svg.toLowerCase().includes(marker.toLowerCase())) {
      return { ok: false, reason: `SVG contains forbidden markup "${marker}"` };
    }
  }

  if (!/<svg[\s>]/.test(svg)) {
    return { ok: false, reason: 'SVG has no <svg> root element' };
  }

  let elements = 0;

  for (const match of svg.matchAll(TAG_PATTERN)) {
    const name = match[1] ?? '';
    const attributes = match[2] ?? '';

    elements += 1;

    if (!ALLOWED_ELEMENTS.has(name)) {
      return { ok: false, reason: `element <${name}> is not allowed` };
    }

    for (const attribute of attributes.matchAll(ATTRIBUTE_PATTERN)) {
      const attributeName = attribute[1] ?? '';

      if (!ALLOWED_ATTRIBUTES.has(attributeName)) {
        return {
          ok: false,
          reason: `attribute "${attributeName}" is not allowed on <${name}>`,
        };
      }
    }
  }

  if (elements === 0) {
    return { ok: false, reason: 'SVG has no elements' };
  }

  if (elements > DEEPSEEK_SVG_MAX_ELEMENTS) {
    return {
      ok: false,
      reason: `SVG has ${elements} elements, limit is ${DEEPSEEK_SVG_MAX_ELEMENTS}`,
    };
  }

  return { ok: true, reason: null };
}

export interface DeepSeekSvgPrompts {
  readonly system: string;
  readonly user: string;
}

/** Geometric prompt from the 2026-11-12 prompt bake-off + visual review. */
export function buildDeepSeekSvgPrompts(
  request: ImageProviderRequest,
): DeepSeekSvgPrompts {
  const palette = (request.palette ?? []).slice(0, 32);
  const paletteLine =
    palette.length > 0
      ? palette.join(', ')
      : '#0C1B31, #23405F, #F5F1E8, #F2A025, #35B4D8';

  const system = [
    'Ты — генератор плоских 2D векторных иконок для вертикального видео.',
    `Холст 400×400, viewBox="0 0 400 400". Ответ — строго один JSON-объект`,
    '{"svg": "<svg …>…</svg>"} без markdown и пояснений.',
    '',
    'Работай как инженер-иллюстратор: сначала числовой план, потом SVG.',
    '',
    '1. Первым содержимым <svg> добавь комментарий <!-- PLAN: … -->. В нём для КАЖДОГО',
    '   элемента укажи тип, координаты, размеры и fill, а последней строкой — использованную',
    '   палитру (3–5 хексов). Пример строки: "Lens: circle cx=200 cy=246 r=64 #0C1B31".',
    '2. Силуэт важнее деталей: объект должен узнаваться с расстояния. Соблюдай реальные',
    '   пропорции (высота/ширина) и укажи габарит объекта в PLAN (x, y, w, h).',
    '2а. Проекция строго фронтальная (анфас) или профиль. Запрещены изометрия, «три четверти»,',
    '   вид сверху, верхняя грань, наклон корпуса и любая перспектива. Верхнюю плоскость не',
    '   рисуй отдельным многоугольником: корпус — один прямоугольник со скруглениями.',
    '3. Форма по смыслу: голова, плод, солнце, мяч, капля — circle/ellipse; животное —',
    '   ellipse и капсулы; техника, мебель, экран — скруглённые прямоугольники. Не строй',
    '   голову или лицо прямоугольником.',
    '4. Все координаты внутри 0..400. Ничего не выходит за холст и не обрезается краем.',
    '5. Порядок отрисовки: фон → главный силуэт → детали. Каждая деталь лежит ВНУТРИ силуэта',
    '   с отступом 8–16 единиц.',
    '6. Не дублируй одинаковые формы друг поверх друга и не перекрывай деталь целиком.',
    '   Соседние окна, клавиши, полосы разделяй промежутком, а не второй заливкой.',
    '7. Вложенные формы (линза, диск колеса) — концентрические и разных цветов; арка колеса',
    '   шире шины и другого цвета.',
    '8. Симметрия: зеркальная координата = 400 − x − width. Листья и ветви растут из одной',
    '   точки, не пересекают ствол, парные элементы — зеркальные.',
    '9. Скругления: rx/ry = 10–20% меньшей стороны, одинаковый радиус в группе. Прямые углы —',
    '   только там, где предмет этого требует (клавиши, экран, дверь).',
    '10. Фон — один сплошной <rect> 0,0,400,400 без rx; нормализатор его снимет.',
    '11. Мелкие детали (глаз, кнопка, нос) — только заливка, без stroke. stroke допустим лишь',
    '    для крупной геометрии, stroke-width не меньше 8.',
    '12. Детализация 10–18 примитивов; каждая деталь не меньше 6 единиц, без визуального шума.',
    '',
    'Допустимые элементы: svg, g, path, rect, circle, ellipse, polygon, polyline.',
    'Допустимые атрибуты: xmlns, viewBox, x, y, width, height, rx, ry, cx, cy, r, d, points,',
    'fill, stroke, stroke-width, stroke-linecap, stroke-linejoin, fill-rule, clip-rule,',
    'transform, opacity, fill-opacity, stroke-opacity.',
    '',
    'Запрещено: text, tspan, image, style, defs, градиенты, filter, mask, clipPath, use,',
    'script, metadata, foreignObject, внешние href, url(...), тени, встроенный CSS, любые',
    'буквы и цифры внутри рисунка.',
    '',
    `Палитра (3–5 цветов из списка): ${paletteLine}.`,
    'Числа в координатах — целые или с одним знаком после запятой.',
  ].join('\n');

  const user = [
    `Объект: ${request.prompt}`,
    'Проекция: строго анфас или профиль. Верхняя грань, изометрия и «три четверти» запрещены,',
    'даже если в описании объекта сказано иначе.',
    `Логический ключ ассета: ${request.key}.`,
    `Стиль: flat 2D, приглушённые цвета, ${request.styleId}.`,
    'Один изолированный объект по центру, без окружения и без перспективы.',
    'Верни только JSON с полем "svg".',
  ].join('\n');

  return { system, user };
}

type ParsedSvgPayload =
  | { readonly ok: true; readonly svg: string }
  | { readonly ok: false; readonly reason: string };

function parseSvgPayload(content: string): ParsedSvgPayload {
  if (content.trim().length === 0) {
    return { ok: false, reason: 'model returned empty content' };
  }

  let raw: unknown;

  try {
    raw = JSON.parse(content);
  } catch {
    return { ok: false, reason: 'response is not a JSON object' };
  }

  const parsed = svgPayloadSchema.safeParse(raw);

  if (!parsed.success) {
    return { ok: false, reason: 'response has no non-empty "svg" string' };
  }

  return { ok: true, svg: parsed.data.svg };
}

function round6(value: number): number {
  return Number(value.toFixed(6));
}

function costOf(usage: LlmJsonUsage, rates: DeepSeekSvgRates): number {
  return round6(
    (usage.promptTokens * rates.inputUsdPerMtok +
      usage.completionTokens * rates.outputUsdPerMtok) /
      1_000_000,
  );
}

function deepseekLicense(): { name: string; commercialUse: boolean } {
  return { name: 'deepseek-api-terms', commercialUse: true };
}

export function createDeepSeekSvgProvider(
  options: DeepSeekSvgProviderOptions = {},
): ImageProvider {
  const apiKey = options.apiKey ?? null;
  const client = options.client ?? null;
  const enabled = apiKey !== null && apiKey.trim().length > 0 && client !== null;
  const model = options.model ?? 'deepseek-flash';
  const rates = options.rates;
  const maxUsdPerCall =
    options.maxUsdPerCall ?? DEEPSEEK_SVG_DEFAULT_MAX_USD_PER_CALL;
  const maxAttempts = options.maxAttempts ?? DEEPSEEK_SVG_MAX_ATTEMPTS;
  const thinking = options.thinking ?? 'enabled';
  // Reasoning tokens are billed inside `max_tokens`; 1600 leaves no room for a
  // plan and produced empty content on palm/pirate in the 2026-11-12 A/B.
  const maxTokens = options.maxTokens ?? (thinking === 'enabled' ? 16_000 : 1600);
  const usageWriter = options.usageWriter ?? null;
  const usageSource = options.usageSource ?? 'assets';
  const simulateFailure = options.simulateFailure ?? null;

  if (
    enabled &&
    (rates === undefined ||
      !Number.isFinite(rates.inputUsdPerMtok) ||
      !Number.isFinite(rates.outputUsdPerMtok))
  ) {
    throw new Error(
      'DeepSeek SVG provider needs LLM_INPUT_USD_PER_MTOK and LLM_OUTPUT_USD_PER_MTOK; ' +
        'costs are never estimated',
    );
  }

  const recordAttempt = async (
    request: ImageProviderRequest,
    attempt: number,
    outcome: 'ok' | 'invalid' | 'over_budget',
    usage: LlmJsonUsage,
    costUsd: number,
  ): Promise<void> => {
    if (usageWriter === null || rates === undefined) {
      return;
    }

    await usageWriter.record({
      provider: DEEPSEEK_SVG_PROVIDER_ID,
      operation: DEEPSEEK_SVG_OPERATION,
      model,
      runId: options.runId ?? null,
      source: usageSource,
      units: usage.promptTokens + usage.completionTokens,
      costUsd,
      meta: {
        assetKey: request.key,
        kind: request.kind,
        styleId: request.styleId,
        attempt,
        outcome,
        prompt: request.prompt.slice(0, 600),
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        inputUsdPerMtok: rates.inputUsdPerMtok,
        outputUsdPerMtok: rates.outputUsdPerMtok,
        priceRef: DEEPSEEK_SVG_PRICE_REF,
      },
    });
  };

  return {
    id: DEEPSEEK_SVG_PROVIDER_ID,
    enabled,
    supports: (kind: AssetKind): boolean => kind === 'svg',
    async generate(
      request: ImageProviderRequest,
    ): Promise<ImageProviderResult> {
      if (!enabled || client === null) {
        throw new ProviderUnavailableError(
          DEEPSEEK_SVG_PROVIDER_ID,
          'DEEPSEEK_API_KEY is not configured',
        );
      }

      if (rates === undefined) {
        throw new ProviderUnavailableError(
          DEEPSEEK_SVG_PROVIDER_ID,
          'LLM token rates are not configured',
        );
      }

      if (simulateFailure === 'unavailable') {
        throw new ProviderUnavailableError(
          DEEPSEEK_SVG_PROVIDER_ID,
          'simulated failure (DEEPSEEK_SVG_FORCE_FAILURE=unavailable)',
        );
      }

      const prompts = buildDeepSeekSvgPrompts(request);
      let lastReason = 'model returned no usable SVG';
      let totalCost = 0;
      let totalUnits = 0;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const response =
          simulateFailure === 'empty'
            ? {
                content: '',
                usage: { promptTokens: 0, completionTokens: 0 },
                model,
              }
            : await client.complete({
                system: prompts.system,
                user:
                  attempt === 1
                    ? prompts.user
                    : `${prompts.user}\n\nПредыдущий ответ не прошёл проверку: ${lastReason}. Верни ТОЛЬКО JSON-объект {"svg": "<svg …>"} с допустимыми элементами и палитрой.`,
                maxTokens,
                temperature: 0.4,
                thinking,
              });

        const costUsd = costOf(response.usage, rates);

        totalCost = round6(totalCost + costUsd);
        totalUnits += response.usage.promptTokens + response.usage.completionTokens;

        if (costUsd > maxUsdPerCall) {
          // The call already happened: record it before refusing the output, so
          // the ledger shows the real spend instead of hiding it.
          await recordAttempt(request, attempt, 'over_budget', response.usage, costUsd);

          throw new ProviderBudgetError(
            DEEPSEEK_SVG_PROVIDER_ID,
            costUsd,
            maxUsdPerCall,
            { requests: attempt, costUsd: totalCost },
          );
        }

        const payload = parseSvgPayload(response.content);
        const reason =
          payload.ok === true ? validateSvgDocument(payload.svg).reason : payload.reason;

        await recordAttempt(request, attempt, reason === null ? 'ok' : 'invalid', response.usage, costUsd);

        if (payload.ok === true && reason === null) {
          const size = svgSize(payload.svg, request.key);

          return {
            asset: {
              data: payload.svg,
              encoding: 'utf8',
              mimeType: 'image/svg+xml',
              width: size.width,
              height: size.height,
              license: deepseekLicense(),
            },
            provider: DEEPSEEK_SVG_PROVIDER_ID,
            model,
            source: 'llm',
            costUsd: totalCost,
            units: totalUnits,
          };
        }

        lastReason = reason ?? 'model returned no usable SVG';
      }

      throw new InvalidAssetError(request.key, DEEPSEEK_SVG_PROVIDER_ID, lastReason, {
        requests: maxAttempts,
        costUsd: totalCost,
      });
    },
  };
}
