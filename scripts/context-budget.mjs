#!/usr/bin/env node
/**
 * Approximate startup context budget for a lazy OpenCode session.
 *
 * Only eagerly loaded instructions and the active plan are counted. Reference
 * documents (SESSION_LOG, ROADMAP, research, ADRs, app-level AGENTS.md) are
 * intentionally excluded because they are loaded on demand.
 *
 * Usage:
 *   pnpm context:check
 *   pnpm context:check -- docs/workspace/plans/<plan>.md
 *   pnpm context:check --strict
 *
 * Exit code is 1 when a required file is missing or --strict is set and there
 * are warnings. Plain warnings do not fail the command.
 */
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PATHS = {
  stateCard: join(ROOT, 'docs/state/current.md'),
  rootAgents: join(ROOT, 'AGENTS.md'),
  globalInstructions: join(homedir(), '.config/opencode/AGENTS_ANGULAR.md'),
};

const LIMITS = {
  stateCardBytes: 6 * 1024,
  planBytes: 8 * 1024,
  totalTokens: 25_000,
};

const argv = process.argv.slice(2);
const help = argv.includes('--help') || argv.includes('-h');
const strict = argv.includes('--strict');

if (help) {
  console.log(`Usage: pnpm context:check [--strict] [-- <plan>]

  --strict   exit with code 1 when any warning is reported
  <plan>     session plan to include in the budget; otherwise the plan named
             in docs/state/current.md is used

Token counts are approximate: Cyrillic is estimated at ~2.5 chars/token,
other text at ~4 chars/token. System prompt, tool schemas and lazily loaded
documents are not counted.`);
  process.exit(0);
}

function readEntry(path) {
  try {
    return { text: readFileSync(path, 'utf8'), bytes: statSync(path).size };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function estimateTokens(text) {
  const cyrillic = (text.match(/[\u0400-\u04FF]/g) ?? []).length;
  const rest = text.length - cyrillic;
  return Math.round(cyrillic / 2.5 + rest / 4);
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatTokens(tokens) {
  return `~${(tokens / 1000).toFixed(1)}k tokens`;
}

function formatChars(chars) {
  return `${chars.toLocaleString('en-US')} chars`;
}

function displayPath(path) {
  return path.replaceAll('\\', '/');
}

function resolvePlanPath() {
  const positional = argv.filter((argument) => !argument.startsWith('-'));
  const fromArgs = positional[0];

  if (fromArgs) {
    return isAbsolute(fromArgs) ? fromArgs : resolve(ROOT, fromArgs);
  }

  if (process.env.CONTEXT_PLAN) {
    const fromEnv = process.env.CONTEXT_PLAN;
    return isAbsolute(fromEnv) ? fromEnv : resolve(ROOT, fromEnv);
  }

  const stateCard = readEntry(PATHS.stateCard);
  if (!stateCard) {
    return null;
  }

  const match = stateCard.text.match(/docs\/workspace\/plans\/[^\s`)"']+\.md/);
  return match ? resolve(ROOT, match[0]) : null;
}

const warnings = [];
const errors = [];

const stateCard = readEntry(PATHS.stateCard);
const rootAgents = readEntry(PATHS.rootAgents);
const globalInstructions = readEntry(PATHS.globalInstructions);
const planPath = resolvePlanPath();
const plan = planPath ? readEntry(planPath) : null;

if (!stateCard) {
  errors.push(`missing required file: ${displayPath(relative(ROOT, PATHS.stateCard))}`);
}
if (!rootAgents) {
  errors.push(`missing required file: ${displayPath(relative(ROOT, PATHS.rootAgents))}`);
}
if (planPath && !plan) {
  warnings.push(`active plan not found: ${displayPath(relative(ROOT, planPath))}`);
}
if (planPath && !planPath.startsWith(ROOT)) {
  warnings.push('active plan is outside the repository; paths are shown as given');
}

const entries = [];
let totalTokens = 0;

function addEntry(label, entry, options = {}) {
  if (!entry) {
    return;
  }

  const tokens = estimateTokens(entry.text);
  totalTokens += tokens;
  entries.push({
    label,
    bytes: entry.bytes,
    chars: entry.text.length,
    tokens,
    ...options,
  });
}

addEntry('docs/state/current.md', stateCard);
addEntry('AGENTS.md', rootAgents);
addEntry('~/.config/opencode/AGENTS_ANGULAR.md', globalInstructions);

if (planPath) {
  const detail = planPath.startsWith(ROOT)
    ? displayPath(relative(ROOT, planPath))
    : planPath;
  addEntry('active plan', plan, { isPlan: true, detail });
}

const stateCardEntry = entries.find((entry) => entry.label === 'docs/state/current.md');
const planEntry = entries.find((entry) => entry.isPlan);

if (stateCardEntry && stateCardEntry.bytes > LIMITS.stateCardBytes) {
  warnings.push(
    `docs/state/current.md is ${formatKb(stateCardEntry.bytes)} (limit ${formatKb(LIMITS.stateCardBytes)})`,
  );
}
if (planEntry && planEntry.bytes > LIMITS.planBytes) {
  warnings.push(`${planEntry.detail} is ${formatKb(planEntry.bytes)} (limit ${formatKb(LIMITS.planBytes)})`);
}
if (!planPath) {
  warnings.push('active plan not specified; pass a path or name it in docs/state/current.md');
}
if (totalTokens > LIMITS.totalTokens) {
  warnings.push(`estimated startup is ${formatTokens(totalTokens)} (limit ${formatTokens(LIMITS.totalTokens)})`);
}

const labelWidth = Math.min(
  Math.max(...entries.map((entry) => entry.label.length), 'Always loaded:'.length),
  40,
);

console.log('Context Budget (approximate)');
console.log('');
console.log('Always loaded:');

if (entries.length === 0) {
  console.log('  (none)');
} else {
  for (const entry of entries) {
    console.log(
      `  ${entry.label.padEnd(labelWidth)}  ${formatKb(entry.bytes).padStart(8)}  ` +
        `${formatChars(entry.chars).padStart(14)}  ${formatTokens(entry.tokens).padStart(12)}`,
    );
    if (entry.detail) {
      console.log(`    ${entry.detail}`);
    }
  }
}

if (!globalInstructions) {
  console.log('  (global AGENTS_ANGULAR.md not found; skipped)');
}

console.log('');
console.log('Estimated startup:');
console.log(`  ${formatTokens(totalTokens)}`);

console.log('');
console.log('Warnings:');
if (warnings.length === 0) {
  console.log('  none');
} else {
  for (const warning of warnings) {
    console.log(`  - ${warning}`);
  }
}

console.log('');
console.log('Notes:');
console.log('  Token counts are approximate (Cyrillic ~2.5 chars/token, other text ~4).');
console.log('  Not counted: system prompt, tool schemas, other instructions, lazily loaded docs.');

if (errors.length > 0) {
  console.error('');
  console.error('Errors:');
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
}

process.exitCode = errors.length > 0 || (strict && warnings.length > 0) ? 1 : 0;
