import { readFileSync } from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  DIRECTOR_SYSTEM_PROMPT,
  buildUserPrompt,
} from '../director/contract-brief.js';
import { ARC_SYSTEM_PROMPT, arcSchema, buildArcPrompt } from './arc.js';
import { sceneContext } from './scene-context.js';
import { topicsSchema } from './topics.js';

/**
 * Prints the exact prompts the film director sends, ready to paste into another
 * model. Generated from the same code, so the text cannot drift from what the
 * pipeline really uses.
 *
 *   ui:prompts --topic "Почему мы помним начало и конец, но не середину"
 *   ui:prompts --input topics.json --out prompts.md
 *
 * The second form is the fair external run: the same topics, the same two-step
 * flow (arc, then one scene per request), in one file to paste into another
 * model.
 */

function optionValue(name: string): string | undefined {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));

  if (inline !== undefined) {
    return inline.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);

  if (index < 0) {
    return undefined;
  }

  const value = process.argv[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Option ${name} requires a value`);
  }

  return value;
}

const SAMPLE_ARC = arcSchema.parse({
  thesis: 'Память хранит края события, а середину стирает',
  scenes: [
    { id: 'hook', role: 'крючок', action: 'середина гаснет', intent: 'зритель видит, что середина исчезает', seconds: 3, theme: 'studio-dark' },
    { id: 'proof', role: 'доказательство', action: 'три блока, средний гаснет', intent: 'зритель понимает механизм', seconds: 8, theme: 'studio-light' },
    { id: 'turn', role: 'поворот', action: 'шкала ломается посередине', intent: 'середина не восстанавливается', seconds: 9, theme: 'studio-lime' },
    { id: 'verdict', role: 'вывод', action: 'остаются два края', intent: 'вывод про края', seconds: 8, theme: 'studio-dark' },
  ],
});

function callSection(): string {
  return [
    '## Параметры вызова',
    '',
    '```',
    'temperature: 0.7, max_tokens: 8000, response_format: {"type": "json_object"}',
    '```',
    '',
    'Ответ — только JSON, без ```-заборов, без пояснений. Язык контента — русский.',
    'Два шага: сначала арка на 4 сцены, затем каждая сцена отдельным запросом.',
    '',
  ].join('\n');
}

function topicTable(topics: readonly { slug: string; topic: string }[]): string {
  const rows = topics.map((entry, index) => `| ${index + 1} | \`${entry.slug}\` | ${entry.topic} |`);

  return ['| # | slug | тема |', '| --- | --- | --- |', ...rows].join('\n');
}

function arcSection(topics: readonly { topic: string }[]): string {
  const prompts = topics.map(
    (entry, index) =>
      `### USER — тема ${index + 1}\n\n\`\`\`text\n${buildArcPrompt(entry.topic)}\n\`\`\``,
  );

  return [
    '## Шаг 1 — арка',
    '',
    '### SYSTEM',
    '',
    '```text',
    ARC_SYSTEM_PROMPT,
    '```',
    '',
    ...prompts.map((block) => `${block}\n`),
    '',
  ].join('\n');
}

function sceneSection(): string {
  const planned = SAMPLE_ARC.scenes[1] ?? SAMPLE_ARC.scenes[0];

  if (planned === undefined) {
    throw new Error('sample arc has no scenes');
  }

  const example = buildUserPrompt('Почему мы помним начало и конец, но не середину', {
    seconds: planned.seconds,
    themeId: planned.theme,
    context: sceneContext(SAMPLE_ARC, planned, 1),
  });

  return [
    '## Шаг 2 — сцена',
    '',
    '### SYSTEM',
    '',
    '```text',
    DIRECTOR_SYSTEM_PROMPT,
    '```',
    '',
    '### Как собрать USER для каждой сцены',
    '',
    '1. Возьми `seconds` и `theme` своей арки для этой сцены.',
    '2. `context` — роль, действие и intent соседних сцен, как в примере ниже.',
    '3. Тему подставь ту же, что на шаге 1.',
    '',
    '### USER — пример (эталонная арка, сцена 2)',
    '',
    '```text',
    example,
    '```',
    '',
    `Верни JSON эпизода с одной сценой той же формы, что в примере: \`schemaVersion: 1\`, \`device: "spec"\`, элементы и sequence.`,
    '',
  ].join('\n');
}

function checkSection(): string {
  return [
    '## Как мы проверим',
    '',
    'Приёмка — тем же кодом, что и для DeepSeek, без ручных правок:',
    '',
    '```',
    'pnpm --filter @peertoreel/render-worker ui:import -- --input <ответ>.json --out <episode>.json',
    '```',
    '',
    'Считаем: сцены приняты/отклонены (цель — 4/4), печать ремонта, потерянные сцены,',
    'доля fallback, разнообразие (строгая и грубая сигнатуры), перепись `model.*` / `gate.*`.',
    '',
    'Контракт не меняется: цвета — роли (`surface`, `accent`, `ink`, `muted`) или hex из темы;',
    'неизвестное свойство или переход удаляется с записью в ремонте, а не принимается молча.',
    '',
  ].join('\n');
}

const input = optionValue('--input');

if (input === undefined) {
  const topic = optionValue('--topic') ?? 'Почему мы помним начало и конец, но не середину';
  const sceneIndex = Math.max(1, Number(optionValue('--scene') ?? '2'));
  const planned = SAMPLE_ARC.scenes[Math.min(sceneIndex, SAMPLE_ARC.scenes.length) - 1] ?? SAMPLE_ARC.scenes[0];

  if (planned === undefined) {
    throw new Error('arc has no scenes');
  }

  console.log('===== ARC: SYSTEM =====');
  console.log(ARC_SYSTEM_PROMPT);
  console.log('===== ARC: USER =====');
  console.log(buildArcPrompt(topic));
  console.log('===== SCENE: SYSTEM =====');
  console.log(DIRECTOR_SYSTEM_PROMPT);
  console.log('===== SCENE: USER =====');
  console.log(
    buildUserPrompt(topic, {
      seconds: planned.seconds,
      themeId: planned.theme,
      context: sceneContext(SAMPLE_ARC, planned, Math.min(sceneIndex, SAMPLE_ARC.scenes.length) - 1),
    }),
  );
  console.log('\n===== CALL =====');
  console.log('temperature: 0.7, max_tokens: 8000, response_format: {"type":"json_object"}');
} else {
  const topics = topicsSchema.parse(JSON.parse(readFileSync(input, 'utf8')));
  const document = [
    '# PeerToReel — внешний прогон: темы и промпты',
    '',
    'Тот же сценарий, что у DeepSeek: те же темы, та же двухшаговая схема (арка, затем сцена).',
    'Промпты сгенерированы из кода пайплайна, поэтому совпадают с тем, что реально уходит модели.',
    '',
    '## Темы',
    '',
    topicTable(topics),
    '',
    callSection(),
    arcSection(topics),
    sceneSection(),
    checkSection(),
  ].join('\n');

  const out = optionValue('--out');

  if (out === undefined) {
    console.log(document);
  } else {
    const target = path.resolve(out);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, `${document}\n`, 'utf8');
    console.log(target);
  }
}
