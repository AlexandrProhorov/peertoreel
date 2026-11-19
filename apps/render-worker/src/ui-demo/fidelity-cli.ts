import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { mappingDocumentSchema } from './fidelity.js';
import { explainMapping, resolveMapping, signatureOf } from './fidelity.js';
import type { BehaviorMatch } from './fidelity.js';

/**
 * Semantic mapping report: the model proposes how each required action maps to
 * a known behaviour (or a new one), and the code decides identity, executability
 * and the final resolution. Nothing here trusts the model's own verdict.
 */
function usage(): void {
  console.log(`Usage:
  pnpm --filter @peertoreel/render-worker ui:fidelity -- --input <mappings.json> [--beats <beats.json>] [--json]

Reads { beats: [ { beatId, match } ] } and prints:
  beatId, identity, matched behaviour, confidence, semantic differences,
  required operations, uncovered operations, final resolution (reuse|compose|create).
Exit code 1 when a mapping is rejected (unknown behaviour or a false difference).
`);
}

function optionValue(name: string): string | undefined {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));

  if (inline !== undefined) {
    return inline.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);

  return index < 0 ? undefined : process.argv[index + 1];
}

async function readConcepts(
  file: string | undefined,
): Promise<Map<string, string>> {
  if (file === undefined) {
    return new Map();
  }

  const raw: unknown = JSON.parse(await readFile(path.resolve(process.cwd(), file), 'utf8'));
  const scenes =
    typeof raw === 'object' && raw !== null && 'scenes' in raw
      ? (raw as {
          scenes: Array<{
            beatId: string;
            narrativePurpose?: string;
            visualConcept?: string;
            visualMechanism?: string;
            onScreenText?: readonly string[];
          }>;
        }).scenes
      : [];

  return new Map(
    scenes.map((scene) => [
      scene.beatId,
      [
        scene.visualConcept,
        scene.visualMechanism,
        scene.narrativePurpose,
        ...(scene.onScreenText ?? []),
      ]
        .filter((part): part is string => typeof part === 'string')
        .join(' — '),
    ]),
  );
}

function confidence(match: BehaviorMatch, accepted: boolean): string {
  if (!accepted) {
    return 'rejected';
  }

  return match.kind === 'known' ? 'exact-signature' : 'proposed';
}

async function main(): Promise<void> {
  const input = optionValue('--input');

  if (input === undefined) {
    usage();
    throw new Error('--input is required');
  }

  const asJson = process.argv.includes('--json');
  const beatsFile = optionValue('--beats');
  const concepts = await readConcepts(beatsFile);
  const raw: unknown = JSON.parse(await readFile(path.resolve(process.cwd(), input), 'utf8'));
  const document = mappingDocumentSchema.parse(raw);

  const rows = document.beats.map((beat) => {
    const conceptText = concepts.get(beat.beatId);
    const resolution = resolveMapping(beat.beatId, beat.match, { conceptText });
    const accepted =
      resolution.signatureIssues.length === 0 &&
      resolution.operationIssues.length === 0 &&
      resolution.evidenceIssues.length === 0;

    return {
      beatId: beat.beatId,
      originalConcept: conceptText ?? null,
      identity: resolution.identity,
      matchedBehavior: resolution.behaviorId,
      matchConfidence: confidence(beat.match, accepted),
      semanticDifferences:
        beat.match.kind === 'proposed'
          ? [
              `${beat.match.semanticDifference.dimension}: ${beat.match.semanticDifference.existing} -> ${beat.match.semanticDifference.required}`,
            ]
          : [],
      canonicalSignature: signatureOf(resolution.behaviorId),
      requiredOperations: beat.match.requiredActions.map((action) => action.operation),
      uncoveredOperations: resolution.uncoveredOperations,
      finalResolution: resolution.finalResolution,
      reason: explainMapping(resolution),
    };
  });

  if (asJson) {
    console.log(JSON.stringify({ rows }, null, 2));
  } else {
    for (const row of rows) {
      console.log(
        `${row.beatId}: ${row.identity} "${row.matchedBehavior}" (${row.matchConfidence}) -> ${row.finalResolution}`,
      );
      console.log(`   ${row.reason}`);
      if (row.semanticDifferences.length > 0) {
        console.log(`   difference: ${row.semanticDifferences.join('; ')}`);
      }
      if (row.requiredOperations.length > 0) {
        console.log(
          `   operations: [${row.requiredOperations.join(', ')}] uncovered: [${row.uncoveredOperations.join(', ')}]`,
        );
      }
    }
  }

  const tally = rows.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.finalResolution] = (accumulator[row.finalResolution] ?? 0) + 1;

    return accumulator;
  }, {});
  const rejected = rows.filter((row) => row.matchConfidence === 'rejected').length;
  const proposed = rows.filter((row) => row.identity === 'proposed').length;

  console.log(
    `\nsummary: reuse=${tally.reuse ?? 0} compose=${tally.compose ?? 0} create=${tally.create ?? 0}, proposed=${proposed}, rejected=${rejected}`,
  );

  if (rejected > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
