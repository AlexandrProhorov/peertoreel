#!/usr/bin/env node
/**
 * One-time migration: split SESSION_LOG.md into a compact index plus one file
 * per session under docs/sessions/<YYYY-MM>/.
 *
 * The split is content-preserving: the script aborts if the concatenation of
 * the extracted sections does not reproduce the original log byte for byte.
 *
 * Usage:
 *   pnpm sessions:split --dry-run
 *   pnpm sessions:split
 *   pnpm sessions:split --force   # overwrite existing record files
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOG = join(ROOT, 'SESSION_LOG.md');
const SESSIONS = join(ROOT, 'docs/sessions');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const help = args.includes('--help') || args.includes('-h');

if (help) {
  console.log(`Usage: pnpm sessions:split [--dry-run] [--force]

  --dry-run   show the target files without writing
  --force     overwrite existing record files

The script refuses to run when SESSION_LOG.md already looks like an index.`);
  process.exit(0);
}

const text = readFileSync(LOG, 'utf8');
const headingPattern = /^## (\d{4}-\d{2}-\d{2})\s*[-—–]\s*(.+)$/gm;
const matches = [...text.matchAll(headingPattern)];

if (matches.length === 0) {
  console.error('SESSION_LOG.md has no dated session headings; nothing to split.');
  process.exit(1);
}

if (matches.length < 2 || text.includes('Full records live in `docs/sessions/')) {
  console.error('SESSION_LOG.md already looks like an index; refusing to split it again.');
  process.exit(1);
}

const preamble = text.slice(0, matches[0].index);
const sections = matches.map((match, index) => {
  const start = match.index;
  const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
  return {
    date: match[1],
    title: match[2].trim(),
    content: text.slice(start, end),
  };
});

const reconstructed = preamble + sections.map((section) => section.content).join('');
if (reconstructed !== text) {
  console.error('Content check failed: extracted sections do not reproduce the original log.');
  process.exit(1);
}

function transliterate(value) {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };

  return [...value].map((character) => map[character] ?? character).join('');
}

function slugify(title) {
  return (
    transliterate(title.toLowerCase())
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64)
      .replace(/-+$/g, '') || 'session'
  );
}

function escapeCell(value) {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

const perDate = new Map();
const records = sections.map((section) => {
  const number = (perDate.get(section.date) ?? 0) + 1;
  perDate.set(section.date, number);

  const sequence = String(number).padStart(2, '0');
  const slug = slugify(section.title);
  const directory = join(SESSIONS, section.date.slice(0, 7));
  const path = join(directory, `${section.date}-${sequence}-${slug}.md`);
  const link = relative(ROOT, path).replaceAll('\\', '/');

  return { ...section, path, link, sequence };
});

const duplicates = records.filter((record) => existsSync(record.path) && !force);
if (duplicates.length > 0) {
  console.error('Refusing to overwrite existing files (use --force):');
  for (const record of duplicates) {
    console.error(`  ${relative(ROOT, record.path)}`);
  }
  process.exit(1);
}

const index = [
  '# SESSION LOG',
  '',
  'Compact index. Full records live in `docs/sessions/<YYYY-MM>/`.',
  'Start here; open only the record you need. New records are at most 50 lines and',
  'follow `docs/templates/session-record.md`. Theory notes belong in local `LEARNING.md`.',
  '',
  '| Date | Session | Record |',
  '| --- | --- | --- |',
  ...[...records]
    .sort(
      (left, right) =>
        right.date.localeCompare(left.date) || left.sequence.localeCompare(right.sequence),
    )
    .map(
      (record) =>
        `| ${record.date} | ${escapeCell(record.title)} | ` +
        `[${record.date}-${record.sequence}](${record.link}) |`,
    ),
  '',
].join('\n');

if (dryRun) {
  console.log(`Would split ${records.length} sessions.`);
  for (const record of records) {
    console.log(`  ${record.link}`);
  }
  console.log(`Index would be ${index.length} characters.`);
  process.exit(0);
}

for (const record of records) {
  mkdirSync(dirname(record.path), { recursive: true });
  writeFileSync(record.path, record.content, 'utf8');
}

writeFileSync(LOG, index, 'utf8');

const recordBytes = records.reduce((sum, record) => sum + Buffer.byteLength(record.content, 'utf8'), 0);

console.log(`Split ${records.length} sessions.`);
console.log(`  SESSION_LOG.md: ${index.length} characters (index)`);
console.log(`  docs/sessions: ${records.length} files, ${recordBytes} bytes`);
console.log('  Content check: ok');
