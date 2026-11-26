import type {
  LlmJsonClient,
  LlmJsonRequest,
  LlmJsonResponse,
  LlmThinkingMode,
} from '@peertoreel/contracts';
import { ProviderHttpError } from '@peertoreel/providers';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { CRITICAL_SAFE_BOUNDS } from '../platform.js';
import type { UiTheme } from '../themes.js';
import { parseJsonResponse } from '../tolerant-json.js';
import { splitNarrationLines } from '../film/voice.js';
import {
  drawNodesSchema,
  normalizeDrawNodes,
  type DrawNode,
  type DrawText,
} from './schema.js';
import { validateDrawNodes } from './validate.js';
import { estimateLines } from './text-metrics.js';
import { TYPE_SCALE, type TypeToken } from '../typography.js';

/** The band that belongs to the spoken line, not to the carrier. */
export const SCREEN_BAND = { top: 1220, bottom: 1600 } as const;
const BAND_TOLERANCE = 24;
const SCREEN_TOKENS: ReadonlySet<string> = new Set(['display', 'headline', 'card']);

/**
 * Three calls, three languages:
 *
 *   1. script     — the story in words and a verbatim fragment of the line on screen;
 *   2. depiction  — the physical carrier, broken into parts, and what reads on it;
 *   3. primitives — the node map that builds the carrier.
 *
 * No prompt names an object or a technique: the model chooses what the frame is
 * made of. Stage two never sees a camera; stage three never sees the story.
 *
 * The screen text is not a second script: it is a short fragment of the spoken
 * line, so the voice and the frame tell the same story.
 */

export function scriptSystem(withBrief: boolean): string {
  return `Ты пишешь сценарий вертикального ролика. Это не кино и не раскадровка: зритель смотрит на экран телефона 4–6 секунд.

${
  withBrief
    ? 'Тебе дана мысль сцены и реплика, разбитая на строки. Придумай, что зритель поймёт в этой сцене; на экране — сами строки, дословно.'
    : 'Тебе дают тему. Придумай, что зритель поймёт в этой сцене, и короткую фразу на экране.'
}

Требования:
- один смысл на сцену;
${
  withBrief
    ? '- onScreen — для каждой строки 4–9 слов дословно: законченная часть строки, не обрывай на служебном слове;'
    : '- фраза на экране — до 6 слов, это не пересказ темы;'
}
- ситуация жизненная и конкретная, но описанная словами: что произошло, без камеры и без указаний, что рисовать;
- не перечисляй предметы и приёмы.

Ответ — только JSON, по-русски:
{ "idea": "...", "onScreen": ["..."], "situation": "одно-два предложения о том, что происходит в жизни" }`;
}

export const SCRIPT_SYSTEM = scriptSystem(false);

export const DEPICTION_SYSTEM = `Ты переводишь мысль сцены в один статичный кадр вертикального ролика.

Это не кино: камеры нет, людей в действии нет, обстановки нет. В кадре только то, что можно нарисовать прямоугольником, текстом, эмодзи или линией.

Кадр делится на две части: сверху — носитель мысли, снизу — полоса под главную фразу. Носитель занимает верхнюю часть и не заходит в нижнюю полосу. Полоса остаётся свободной: в ней будет стоять фраза сценария, крупно и целиком.

Сначала реши, на какой одной поверхности или вещи зритель прочитает мысль. Разбери её на части: из чего она физически состоит и что видно на каждой части. Частей должно быть 3–4: поверхность почти никогда не бывает одной надписью. Текст на части — до 40 символов.

Потом назови 2–3 элемента, которые читаются в кадре, с их текстом.

Человек допустим только как эмодзи, и только если без него смысл теряется.

Не описывай камеру, планы, жесты и выражения лица. Не перечисляй приёмы — назови только то, что нужно этой сцене.

Ответ — только JSON, по-русски:
{
  "carrier": {
    "what": "...",
    "parts": [{ "part": "...", "detail": "...", "text": "..." }]
  },
  "elements": [{ "what": "...", "text": "...", "emphasis": "main|support|detail" }]
}`;

export function drawSystem(background: string): string {
  return `Ты собираешь кадр вертикального ролика 1080×1920 из четырёх узлов.

Холст 1080×1920 — это и есть фон кадра (${background}). Рисуй прямо на нём; не оборачивай всю сцену в общий контейнер.

Узлы:
box — прямоугольник: x, y, w, h, r, rot (−45..45), fill, stroke, strokeWidth, shadow, clip, opacity; дети в координатах родителя.
text — строка: x, y, w, text, token (display|headline|card|body|caption), weight, align, color.
icon — эмодзи: x, y, size, emoji.
line — линия: x1, y1, x2, y2, width, dashed, color.

Как собирать:
- собери носитель из узлов: его части — это box, line и icon, а текст живёт внутри частей;
- если в кадре только текст на фоне — это не кадр: у носителя должны быть видимые части;
- box — поверхность с детьми или с текстом; пустой box запрещён;
- на экране только текст из частей и элементов; служебные описания (что это за часть) не выводятся;
- не подписывай объект его названием;
- стиль: плоская инфографика, а не фотография предмета — простые прямоугольники, без рваных краёв и мелких деталей; тень допустима только у самого носителя;
- кадр делится на две части: носитель и его части — сверху (y 80..1180); нижняя полоса (y 1220..1600) — только под главную фразу, ничего больше в ней нет;
- главную фразу ставь крупно (headline или display) в нижней полосе, целой строкой; не накладывай текст на носитель;
- 3–8 верхнеуровневых узлов, но каждая часть носителя считается;
- не больше 16 слов текста на всём кадре;
- всё важное в пределах x 72..890, y 80..1620;
- один акцент: одно крупное число, слово или часть;
- цвета: свой hex или роль темы (background, surface, surfaceInk, ink, muted, accent, accentInk); держись одной гаммы;
- у узла может быть at (0..1.8) и transition (appear|type|print|draw|tick|slide).

Ответ — только JSON { "nodes": [ ... ] }, без markdown.`;
}

export const scriptSchema = z.object({
  idea: z.string().min(1).max(300),
  /** Verbatim fragment per narration line, in order; one invented phrase for a topic. */
  onScreen: z.array(z.string().min(1).max(80)).min(1).max(4),
  situation: z.string().min(1).max(400),
});

export const depictionSchema = z.object({
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
});

export type DrawScript = z.infer<typeof scriptSchema>;
export type DrawDepiction = z.infer<typeof depictionSchema>;

export interface SceneTokens {
  prompt: number;
  completion: number;
}

export interface GeneratedScene {
  readonly script: DrawScript;
  readonly depiction: DrawDepiction;
  readonly nodes: DrawNode[];
  readonly words: number;
  readonly fixes: string[];
  readonly issues: string[];
  readonly attempts: number;
  readonly tokens: SceneTokens;
}

export interface GenerateSceneOptions {
  readonly topic: string;
  /** A frozen arc beat: the scene answers this thought, not the topic. */
  readonly brief?: { readonly intent: string; readonly narration: string };
  readonly theme: UiTheme;
  readonly seconds: number;
  readonly client: LlmJsonClient;
  /** Stage artifacts are written here when provided; omitted in unit tests. */
  readonly outDir?: string;
  readonly thinking: LlmThinkingMode;
  readonly wordBudget?: number;
}

const STAGE_ATTEMPTS = 2;
const DRAW_ATTEMPTS = 2;
const DEFAULT_WORD_BUDGET = 26;
const PROVIDER_ATTEMPTS = 3;

/**
 * One model call with transient retries. A network hiccup or a 5xx must not
 * kill a film that is already half drawn; a terminal error (auth, bad request)
 * is never retried.
 */
export async function completeWithRetry(
  client: LlmJsonClient,
  request: LlmJsonRequest,
): Promise<LlmJsonResponse> {
  let last: unknown;

  for (let attempt = 1; attempt <= PROVIDER_ATTEMPTS; attempt += 1) {
    try {
      return await client.complete(request);
    } catch (error: unknown) {
      last = error;

      const terminal = error instanceof ProviderHttpError && error.kind === 'terminal';

      if (terminal || attempt === PROVIDER_ATTEMPTS) {
        throw error;
      }

      await delay(400 * attempt);
    }
  }

  throw last;
}

function stripFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(trimmed);

  return fenced?.[1] ?? trimmed;
}

function stageError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join('.') || '$'}: ${issue.message}`)
      .join('; ');
  }

  return error instanceof Error ? error.message : String(error);
}

async function writeArtifact(
  dir: string | undefined,
  name: string,
  value: string,
): Promise<void> {
  if (dir === undefined) {
    return;
  }

  await writeFile(path.join(dir, name), value, 'utf8');
}

async function runStage<T>(
  options: GenerateSceneOptions,
  name: string,
  system: string,
  user: string,
  schema: z.ZodType<T>,
  tokens: SceneTokens,
  temperature: number,
  thinking: LlmThinkingMode,
): Promise<T> {
  let errors = '';
  let last = '';

  for (let attempt = 1; attempt <= STAGE_ATTEMPTS; attempt += 1) {
    const response = await completeWithRetry(options.client, {
      system,
      user: `${user}${errors === '' ? '' : `\n\nПрошлый ответ не разобрался: ${errors}. Верни JSON заново.`}`,
      temperature,
      thinking,
    });

    tokens.prompt += response.usage.promptTokens;
    tokens.completion += response.usage.completionTokens;

    const raw = stripFence(response.content);
    last = raw;
    await writeArtifact(options.outDir, `${name}-attempt-${String(attempt)}.raw.json`, raw);

    try {
      return schema.parse(parseJsonResponse(raw));
    } catch (error: unknown) {
      errors = stageError(error);
    }
  }

  throw new Error(`${name}: ${errors}\n${last.slice(0, 400)}`);
}

/** A childless full-frame panel is a painted backdrop: the canvas already has one. */
export function stripBackdrop(nodes: readonly DrawNode[]): {
  nodes: DrawNode[];
  fixes: string[];
} {
  const width = CRITICAL_SAFE_BOUNDS.right - CRITICAL_SAFE_BOUNDS.left;
  const height = CRITICAL_SAFE_BOUNDS.bottom - CRITICAL_SAFE_BOUNDS.top;
  const kept: DrawNode[] = [];
  const fixes: string[] = [];

  for (const node of nodes) {
    const panel =
      node.kind === 'box' &&
      node.children === undefined &&
      node.w * node.h >= width * height * 0.7;

    if (panel) {
      fixes.push('backdrop-dropped');
      continue;
    }

    kept.push(node);
  }

  return { nodes: kept, fixes };
}

/** A frame made only of text on the background is not a composition. */
export function flatFrame(nodes: readonly DrawNode[]): string | null {
  const kinds = new Set(nodes.map((node) => node.kind));

  if (kinds.size === 1 && kinds.has('text')) {
    return 'в кадре только текст на фоне: собери носитель из частей (box, line, icon), текст положи внутрь';
  }

  return null;
}

/**
 * The same sentence repeated four times is a stuck loop, not a list: the model
 * copied one row instead of writing the scene.
 */
export function repeatedText(nodes: readonly DrawNode[], limit = 6): string | null {
  const counts = new Map<string, { text: string; count: number }>();

  const walk = (list: readonly DrawNode[]): void => {
    for (const node of list) {
      if (node.kind === 'text') {
        const key = normalizeText(node.text);

        if (wordsOf(node.text).length >= 2) {
          const entry = counts.get(key);

          counts.set(key, { text: node.text, count: (entry?.count ?? 0) + 1 });
        }
      }

      if (node.kind === 'box' && node.children !== undefined) {
        walk(node.children);
      }
    }
  };

  walk(nodes);

  for (const entry of counts.values()) {
    if (entry.count > limit) {
      return `одна и та же строка повторяется ${String(entry.count)} раз: «${entry.text.slice(0, 40)}»`;
    }
  }

  return null;
}

/** Lowercase, no punctuation: “Ёлка.” and “елка” are the same words. */
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

/** Words with their original case and punctuation. */
function splitWords(value: string): string[] {
  return value.trim().split(/\s+/u).filter((word) => word !== '');
}

const FUNCTION_WORDS = new Set([
  'а',
  'без',
  'бы',
  'в',
  'во',
  'вот',
  'да',
  'для',
  'до',
  'если',
  'же',
  'за',
  'и',
  'из',
  'или',
  'к',
  'как',
  'ко',
  'когда',
  'какой',
  'какая',
  'какие',
  'кем',
  'которое',
  'которые',
  'который',
  'которых',
  'которым',
  'которыми',
  'которую',
  'куда',
  'откуда',
  'почему',
  'потому',
  'поэтому',
  'тем',
  'том',
  'того',
  'этом',
  'этого',
  'зачем',
  'где',
  'ли',
  'на',
  'не',
  'ни',
  'но',
  'о',
  'об',
  'от',
  'по',
  'при',
  'с',
  'со',
  'так',
  'то',
  'только',
  'у',
  'чем',
  'что',
  'чтобы',
  'это',
]);

/** Words at the edges of a fragment that make it read as a cut, not a phrase. */
function trimFront(words: readonly string[]): string[] {
  const result = [...words];

  while (result.length > 0 && FUNCTION_WORDS.has(normalizeText(result[0] ?? ''))) {
    result.shift();
  }

  return result;
}

function trimBack(words: readonly string[]): string[] {
  const result = [...words];

  while (
    result.length > 0 &&
    FUNCTION_WORDS.has(normalizeText(result[result.length - 1] ?? ''))
  ) {
    result.pop();
  }

  return result;
}

function trimEdges(words: readonly string[]): string[] {
  return trimBack(trimFront(words));
}

/**
 * The longest readable piece of the line: merge neighbouring clauses until the
 * phrase has 4–9 words. Commas between merged clauses stay, so the screen text
 * is a verbatim piece of the line, not a list of chopped words.
 */
function clauseWindow(line: string): string | null {
  const clauses = line
    .split(/[,;:—–.!?…]+/u)
    .map((clause) => splitWords(clause))
    .filter((clause) => clause.length > 0);

  for (let start = 0; start < clauses.length; start += 1) {
    const group: string[][] = [];
    let count = 0;

    for (let end = start; end < clauses.length; end += 1) {
      const clause = clauses[end] ?? [];

      group.push(clause);
      count += clause.length;

      if (count > 9) {
        break;
      }

      if (count >= 4) {
        const parts = group.map((part) => [...part]);

        parts[0] = trimFront(parts[0] ?? []);
        parts[parts.length - 1] = trimBack(parts[parts.length - 1] ?? []);

        const text = parts
          .filter((part) => part.length > 0)
          .map((part) => part.join(' '))
          .join(', ');

        if (text !== '') {
          return text;
        }
      }
    }
  }

  return null;
}

export function pickScreenLine(fragment: string, line: string): string {
  const candidate = trimEdges(splitWords(fragment));
  const lineWords = splitWords(line);
  const candidateText = candidate.join(' ');
  const candidateCleanEnd =
    !/[,:;—–-]$/u.test(candidateText) &&
    !FUNCTION_WORDS.has(normalizeText(candidate[candidate.length - 1] ?? ''));

  if (
    candidate.length >= 4 &&
    candidate.length <= 9 &&
    candidateCleanEnd &&
    normalizeText(line).includes(normalizeText(candidateText))
  ) {
    return candidateText;
  }

  /* A sentence that fits the frame stays whole: the reference shows the full
     line, never a cut that ends on a comma or a dash. */
  const lastWord = lineWords[lineWords.length - 1] ?? '';
  const brokenEnd = /[,:;—–-]$/u.test(line.trim());
  const cleanEnd =
    !brokenEnd && !FUNCTION_WORDS.has(normalizeText(lastWord.replace(/[.!?…]+$/u, '')));

  if (lineWords.length >= 4 && lineWords.length <= 12 && cleanEnd) {
    return lineWords.join(' ');
  }

  const window = clauseWindow(line);

  if (window !== null) {
    return window;
  }

  return trimEdges(lineWords.slice(0, 12)).join(' ');
}

export function normalizeFragments(
  fragments: readonly string[],
  lines: readonly string[],
): { fragments: string[]; fixes: string[] } {
  const fixes: string[] = [];

  if (lines.length === 0) {
    return {
      fragments: [fragments[0]?.trim() ?? ''],
      fixes,
    };
  }

  const result = lines.map((line, index) => {
    const chosen = pickScreenLine(fragments[index] ?? '', line);

    if (normalizeText(fragments[index] ?? '') !== normalizeText(chosen)) {
      fixes.push(`line-clause:${String(index + 1)}`);
    }

    return chosen;
  });

  return { fragments: result, fixes };
}

/** Text nodes in paint order: a fragment must appear after the previous one. */
export function missingFragments(
  nodes: readonly DrawNode[],
  fragments: readonly string[],
): string[] {
  const texts: string[] = [];

  const walk = (list: readonly DrawNode[]): void => {
    for (const node of list) {
      if (node.kind === 'text') {
        texts.push(normalizeText(node.text));
      }

      if (node.kind === 'box' && node.children !== undefined) {
        walk(node.children);
      }
    }
  };

  walk(nodes);

  const missing: string[] = [];
  let cursor = 0;

  for (const fragment of fragments) {
    const needle = normalizeText(fragment);
    const found = texts.findIndex(
      (text, index) => index >= cursor && needle !== '' && text.includes(needle),
    );

    if (found < 0) {
      missing.push(fragment);
      continue;
    }

    cursor = found + 1;
  }

  return missing;
}

/** Text nodes with their paint depth, for the screen-band gate. */
function collectBandTexts(
  nodes: readonly DrawNode[],
  depth = 0,
  out: { node: DrawText; normal: string; depth: number }[] = [],
): { node: DrawText; normal: string; depth: number }[] {
  for (const node of nodes) {
    if (node.kind === 'text') {
      out.push({ node, normal: normalizeText(node.text), depth });
    }

    if (node.kind === 'box' && node.children !== undefined) {
      collectBandTexts(node.children, depth + 1, out);
    }
  }

  return out;
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

/**
 * The spoken line is planned by the frame: it stands on the canvas inside the
 * reserved band, in a large token, and the carrier never enters that band. This
 * is what makes the text part of the composition instead of an overlay.
 */
export function bandIssues(nodes: readonly DrawNode[], lines: readonly string[]): string[] {
  if (lines.length === 0) {
    return [];
  }

  const texts = collectBandTexts(nodes);
  const screen = new Set<DrawText>();
  const issues: string[] = [];

  for (const line of lines) {
    const needle = normalizeText(line);
    const found = texts.find(
      (text) => !screen.has(text.node) && text.normal.includes(needle),
    );

    if (found === undefined) {
      continue;
    }

    screen.add(found.node);

    if (found.depth !== 0) {
      issues.push('фраза должна стоять на холсте, а не внутри карточки');
    }

    const bottom = textBottom(found.node);

    if (found.node.y < SCREEN_BAND.top - BAND_TOLERANCE || bottom > SCREEN_BAND.bottom + BAND_TOLERANCE) {
      issues.push(
        `фраза должна стоять в нижней полосе y ${String(SCREEN_BAND.top)}..${String(SCREEN_BAND.bottom)}`,
      );
    }

    if (!SCREEN_TOKENS.has(found.node.token ?? 'body')) {
      issues.push('фраза — не мелкая подпись: display, headline или card');
    }
  }

  for (const node of nodes) {
    if (node.kind === 'text' && screen.has(node)) {
      continue;
    }

    const bottom =
      node.kind === 'line'
        ? Math.max(node.y1, node.y2)
        : node.kind === 'icon'
          ? node.y + node.size
          : node.kind === 'text'
            ? textBottom(node)
            : node.y + node.h;

    if (bottom > SCREEN_BAND.top + 8) {
      issues.push(
        `носитель или декор заходит в полосу фразы (ниже y ${String(SCREEN_BAND.top)})`,
      );
      break;
    }
  }

  return issues;
}

/**
 * One scene: three calls, then deterministic repair. The model owns the idea and
 * the carrier; the validator owns spacing, type size and contrast.
 */
export async function generateScene(options: GenerateSceneOptions): Promise<GeneratedScene> {
  const dir = options.outDir;
  const tokens: SceneTokens = { prompt: 0, completion: 0 };

  if (dir !== undefined) {
    await mkdir(dir, { recursive: true });
  }

  const lines =
    options.brief === undefined
      ? []
      : splitNarrationLines(options.brief.narration, 200).map((line) => line.text);

  const parsedScript = await runStage(
    options,
    '01-script',
    scriptSystem(options.brief !== undefined),
    options.brief === undefined
      ? `Тема ролика: ${options.topic}\n\nПридумай один конкретный момент, в котором эта тема бьёт по человеку, и фразу на экране.`
      : `Мысль сцены: ${options.brief.intent}\nРеплика по строкам:\n${lines
          .map((line, index) => `${String(index + 1)}. ${line}`)
          .join('\n')}\n\nВыбери экранный фрагмент для каждой строки.`,
    scriptSchema,
    tokens,
    0.9,
    'disabled',
  );
  const normalized = normalizeFragments(parsedScript.onScreen, lines);
  const script: DrawScript = { ...parsedScript, onScreen: normalized.fragments };

  await writeArtifact(dir, '01-script.json', `${JSON.stringify(script, null, 2)}\n`);

  const depiction = await runStage(
    options,
    '02-depiction',
    DEPICTION_SYSTEM,
    `Сценарий сцены:\n${JSON.stringify(script, null, 2)}\n\nПридумай, как её изобразить.`,
    depictionSchema,
    tokens,
    0.8,
    options.thinking,
  );
  await writeArtifact(dir, '02-depiction.json', `${JSON.stringify(depiction, null, 2)}\n`);

  const parts = depiction.carrier.parts
    .map(
      (part) =>
        `- ${part.part}: ${part.detail}${part.text === undefined ? '' : ` — «${part.text}»`}`,
    )
    .join('\n');
  const fragments = script.onScreen
    .map((fragment, index) => `${String(index + 1)}. «${fragment}»`)
    .join('\n');

  let best: { nodes: DrawNode[]; fixes: string[]; issues: string[]; words: number } | null = null;
  let attempts = 0;
  let correction = '';

  for (let attempt = 1; attempt <= DRAW_ATTEMPTS; attempt += 1) {
    attempts = attempt;

    const user = `Носитель: ${depiction.carrier.what}
Части:
${parts}

Элементы:
${JSON.stringify(depiction.elements, null, 2)}

Фразы на экране — дословно, по порядку:
${fragments}${correction}`;

    const response = await completeWithRetry(options.client, {
      system: drawSystem(options.theme.background),
      user,
      temperature: 0.7,
      thinking: options.thinking,
    });

    tokens.prompt += response.usage.promptTokens;
    tokens.completion += response.usage.completionTokens;

    const raw = stripFence(response.content);
    await writeArtifact(dir, `03-draw-attempt-${String(attempt)}.raw.json`, raw);

    let nodes: DrawNode[];

    try {
      const parsed: unknown = parseJsonResponse(raw);
      nodes = drawNodesSchema.parse(
        normalizeDrawNodes((parsed as { nodes?: unknown }).nodes),
      ) as DrawNode[];
    } catch (error: unknown) {
      correction = `\n\nПрошлый ответ не разобрался: ${stageError(error)}. Верни JSON заново.`;
      continue;
    }

    const stripped = stripBackdrop(nodes);
    const result = validateDrawNodes(
      stripped.nodes,
      CRITICAL_SAFE_BOUNDS,
      { nodes: Number.POSITIVE_INFINITY, words: options.wordBudget ?? DEFAULT_WORD_BUDGET },
      options.theme,
    );
    const flat = flatFrame(stripped.nodes);
    const repeated = repeatedText(result.nodes);
    const issues = result.issues.map((issue) => issue.message);
    const missing = missingFragments(result.nodes, script.onScreen);

    issues.push(...bandIssues(stripped.nodes, script.onScreen));

    if (flat !== null) {
      issues.push(flat);
    }

    if (repeated !== null) {
      issues.push(repeated);
    }

    if (missing.length > 0) {
      issues.push(
        `на экране нет дословно: ${missing.map((fragment) => `«${fragment}»`).join(', ')}`,
      );
    }

    result.fixes.push(...stripped.fixes);

    const candidate = {
      nodes: result.nodes,
      fixes: result.fixes,
      issues,
      words: result.words,
    };

    if (best === null || candidate.issues.length < best.issues.length) {
      best = candidate;
    }

    if (issues.length === 0) {
      break;
    }

    correction = `\n\nПроверка кадра: ${issues.join('; ')}.`;
  }

  if (best === null) {
    throw new Error(`${options.topic}: no frame`);
  }

  return {
    script,
    depiction,
    nodes: best.nodes,
    words: best.words,
    fixes: [...normalized.fixes, ...best.fixes],
    issues: best.issues,
    attempts,
    tokens,
  };
}
