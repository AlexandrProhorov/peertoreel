import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { aggregateOf, measureRuns, type CodeCount, type RunMetrics } from './metrics.js';
import { scanRuns } from './sources.js';

/**
 * `ui:bench` — metrics over paid archives, no model and no render.
 *
 * Output is deterministic: the same `out/` gives the same bytes, so two runs
 * can be diffed and a series can be compared to the previous one.
 */

export interface BenchOptions {
  readonly root: string;
  readonly out: string;
}

function number(value: number | null): string {
  return value === null ? 'n/a' : String(value);
}

function total(counts: readonly CodeCount[]): number {
  return counts.reduce((sum, entry) => sum + entry.count, 0);
}

function markdown(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`;
  const separator = header.map(() => '---');

  return [line(header), line(separator), ...rows.map(line)].join('\n');
}

export function summaryTable(runs: readonly RunMetrics[]): string {
  const header = [
    'run',
    'topics',
    'reported',
    'planned',
    'produced',
    'lost',
    'degraded',
    'fallback',
    'scenes',
    'unique',
    'sig/scene',
    'sets',
    'sets/scene',
    'vocab/film',
    'model',
    'gate',
  ];

  const rows = runs.map((run) => {
    const reported = run.topics.filter((topic) => topic.reported).length;

    return [
      run.run,
      String(run.topics.length),
      `${reported}/${run.topics.length}`,
      number(run.totals.planned),
      number(run.totals.produced),
      number(run.totals.lost),
      number(run.totals.degraded),
      number(run.totals.fallback),
      String(run.totals.scenes),
      String(run.totals.uniqueScenes),
      run.totals.signatureRatio.toFixed(2),
      String(run.totals.coarseUniqueScenes),
      run.totals.coarseRatio.toFixed(2),
      run.totals.vocabularyPerFilm.toFixed(2),
      String(total(run.totals.model)),
      String(total(run.totals.gate)),
    ];
  });

  return markdown(header, rows);
}

export function censusTable(
  runs: readonly RunMetrics[],
  pick: (run: RunMetrics) => readonly CodeCount[],
): string {
  const codes = [...new Set(runs.flatMap((run) => pick(run).map((entry) => entry.code)))].sort();

  if (codes.length === 0) {
    return '_пусто_';
  }

  const header = ['code', ...runs.map((run) => run.run)];
  const rows = codes.map((code) => [
    code,
    ...runs.map((run) => {
      const entry = pick(run).find((item) => item.code === code);

      return entry === undefined ? '·' : String(entry.count);
    }),
  ]);

  return markdown(header, rows);
}

export function report(runs: readonly RunMetrics[]): string {
  return [
    '# Bench: архивы без LLM и рендера',
    '',
    'Две колонки намеренно разделены: `model` — выдумки модели, `gate` — наши отказы.',
    '`n/a` означает, что поле не записано в архиве; это не ноль.',
    '',
    '## Сводка',
    '',
    summaryTable(runs),
    '',
    '## Словарь модели',
    '',
    censusTable(runs, (run) => run.totals.model),
    '',
    '## Гейты',
    '',
    censusTable(runs, (run) => run.totals.gate),
    '',
  ].join('\n');
}

async function write(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

export async function bench(options: BenchOptions): Promise<{
  runs: readonly RunMetrics[];
  report: string;
}> {
  const runs = measureRuns(await scanRuns(options.root));

  await write(
    join(options.out, 'aggregate.json'),
    `${JSON.stringify(aggregateOf(runs), null, 2)}\n`,
  );

  for (const run of runs) {
    await write(join(options.out, 'runs', `${run.run}.json`), `${JSON.stringify(run, null, 2)}\n`);
  }

  const text = `${report(runs)}\n`;

  await write(join(options.out, 'table.md'), text);

  return { runs, report: text };
}
