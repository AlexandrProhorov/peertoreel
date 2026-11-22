import { z } from 'zod';
import { IMPLEMENTATIONS, type ImplementationContract } from './catalog.js';
import {
  ACTIONS,
  BEHAVIORS,
  FINAL_STATES,
  INITIAL_STATES,
  PROGRESSIONS,
  SIGNATURE_DIMENSIONS,
  TARGETS,
  behaviorById,
  primitiveBehaviors,
  supportedOperations,
  type BehaviorSignature,
  type SignatureDimension,
} from './behaviors.js';

/**
 * Two independent axes:
 *   identity      — known in the registry or newly proposed?
 *   executability — can we actually perform it?
 *
 * A mapping is accepted only if the signature matches, the operations belong to
 * the behaviour, and every evidence quote really appears in the concept. Code
 * decides the final resolution; the model never returns it.
 */
export const signatureSchema = z.object({
  target: z.enum(TARGETS),
  initialState: z.enum(INITIAL_STATES),
  action: z.enum(ACTIONS),
  progression: z.enum(PROGRESSIONS),
  finalState: z.enum(FINAL_STATES),
});

export const requiredActionSchema = z.object({
  operation: z.string().min(1).max(32),
  target: z.string().min(1).max(32),
  progression: z.string().min(1).max(32).optional(),
});

export const evidenceSchema = z.object({
  /** A phrase taken from the concept itself, not paraphrased. */
  quote: z.string().min(3).max(200),
  /** Which signature dimension this phrase supports. */
  supports: z.enum(SIGNATURE_DIMENSIONS),
});

export const knownMatchSchema = z.object({
  kind: z.literal('known'),
  behaviorId: z.string().min(1).max(48),
  signature: signatureSchema,
  evidence: z.array(evidenceSchema).min(1).max(3),
  requiredActions: z.array(requiredActionSchema).min(1).max(6),
  why: z.string().min(1).max(280),
});

export const proposedMatchSchema = z.object({
  kind: z.literal('proposed'),
  proposed: z
    .string()
    .min(3)
    .max(48)
    .regex(/^[a-z][a-z0-9-]+$/, 'use kebab-case'),
  meaning: z.string().min(1).max(200),
  signature: signatureSchema,
  semanticDifference: z.object({
    comparedTo: z.string().min(1).max(48),
    dimension: z.enum(SIGNATURE_DIMENSIONS),
    existing: z.string().min(1).max(120),
    required: z.string().min(1).max(120),
  }),
  requiredActions: z.array(requiredActionSchema).min(1).max(6),
  why: z.string().min(1).max(280),
});

export const behaviorMatchSchema = z.discriminatedUnion('kind', [
  knownMatchSchema,
  proposedMatchSchema,
]);

export const mappingDocumentSchema = z
  .object({
    beats: z
      .array(
        z.object({
          beatId: z.string().min(1).max(16),
          match: behaviorMatchSchema,
        }),
      )
      .min(1)
      .max(32),
  })
  .superRefine((document, context) => {
    const seen = new Set<string>();

    for (const [index, beat] of document.beats.entries()) {
      if (seen.has(beat.beatId)) {
        context.addIssue({
          code: 'custom',
          path: ['beats', index, 'beatId'],
          message: `duplicate beatId "${beat.beatId}"`,
        });
      } else {
        seen.add(beat.beatId);
      }
    }
  });

export type BehaviorMatch = z.infer<typeof behaviorMatchSchema>;
export type MappingDocument = z.infer<typeof mappingDocumentSchema>;

export type Executability = 'reuse' | 'compose' | 'create';

export interface MappingContext {
  /** Concept text the evidence quotes must come from. */
  readonly conceptText?: string;
}

export interface MappingResolution {
  readonly beatId: string;
  readonly identity: 'known' | 'proposed';
  readonly behaviorId: string;
  readonly implementationId: string | null;
  readonly signatureIssues: readonly string[];
  readonly operationIssues: readonly string[];
  readonly evidenceIssues: readonly string[];
  readonly uncoveredOperations: readonly string[];
  /** Computed by code, never returned by the model. */
  readonly finalResolution: Executability;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[«»""'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameSignature(left: BehaviorSignature, right: BehaviorSignature): boolean {
  return SIGNATURE_DIMENSIONS.every((dimension) => left[dimension] === right[dimension]);
}

function differingDimensions(
  left: BehaviorSignature,
  right: BehaviorSignature,
): SignatureDimension[] {
  return SIGNATURE_DIMENSIONS.filter((dimension) => left[dimension] !== right[dimension]);
}

function implementationsFor(behaviorId: string): ImplementationContract[] {
  return IMPLEMENTATIONS.filter((implementation) =>
    implementation.behaviors.includes(behaviorId),
  ).sort((left, right) => left.id.localeCompare(right.id));
}

export function resolveMapping(
  beatId: string,
  match: BehaviorMatch,
  context: MappingContext = {},
): MappingResolution {
  const signatureIssues: string[] = [];
  const operationIssues: string[] = [];
  const evidenceIssues: string[] = [];
  const uncoveredOperations: string[] = [];
  const base = { beatId, signatureIssues, operationIssues, evidenceIssues, uncoveredOperations };

  if (match.kind === 'known') {
    const behavior = behaviorById(match.behaviorId);

    if (behavior === null) {
      return {
        ...base,
        identity: 'known',
        behaviorId: match.behaviorId,
        implementationId: null,
        signatureIssues: [`unknown behaviour "${match.behaviorId}"`],
        finalResolution: 'create',
      };
    }

    if (!sameSignature(behavior.signature, match.signature)) {
      signatureIssues.push(
        `signature differs from "${behavior.id}" in: ${differingDimensions(
          behavior.signature,
          match.signature,
        ).join(', ')}`,
      );
    }

    for (const action of match.requiredActions) {
      if (!behavior.operations.includes(action.operation)) {
        operationIssues.push(
          `operation "${action.operation}" is not part of "${behavior.id}"`,
        );
      }
    }

    if (context.conceptText !== undefined) {
      const concept = normalize(context.conceptText);

      for (const item of match.evidence) {
        if (!concept.includes(normalize(item.quote))) {
          evidenceIssues.push(
            `quote not found in the concept: "${item.quote}" (supports ${item.supports})`,
          );
        }
      }
    }

    if (
      signatureIssues.length > 0 ||
      operationIssues.length > 0 ||
      evidenceIssues.length > 0
    ) {
      return {
        ...base,
        identity: 'known',
        behaviorId: match.behaviorId,
        implementationId: null,
        finalResolution: 'create',
      };
    }

    const implementations = implementationsFor(behavior.id);

    if (implementations.length > 0) {
      return {
        ...base,
        identity: 'known',
        behaviorId: behavior.id,
        implementationId: implementations[0]?.id ?? null,
        finalResolution: 'reuse',
      };
    }

    return {
      ...base,
      identity: 'known',
      behaviorId: behavior.id,
      implementationId: null,
      uncoveredOperations: behavior.implementedByPrimitives ? [] : behavior.operations,
      finalResolution: behavior.implementedByPrimitives ? 'compose' : 'create',
    };
  }

  /* Identity confusion: a "new" behaviour must not reuse a known id. */
  if (behaviorById(match.proposed) !== null) {
    signatureIssues.push(
      `"${match.proposed}" already exists in the registry: use kind="known"`,
    );
  }

  const comparison = behaviorById(match.semanticDifference.comparedTo);

  if (comparison === null) {
    signatureIssues.push(
      `semanticDifference.comparedTo "${match.semanticDifference.comparedTo}" is not in the registry`,
    );
  } else if (
    sameSignature(comparison.signature, match.signature) ||
    comparison.signature[match.semanticDifference.dimension] ===
      match.signature[match.semanticDifference.dimension]
  ) {
    signatureIssues.push(
      `claimed difference in "${match.semanticDifference.dimension}" is not a difference`,
    );
  }

  const supported = supportedOperations();

  for (const action of match.requiredActions) {
    if (!supported.has(action.operation)) {
      uncoveredOperations.push(action.operation);
    }
  }

  return {
    ...base,
    identity: 'proposed',
    behaviorId: match.proposed,
    implementationId: null,
    finalResolution:
      signatureIssues.length > 0 || uncoveredOperations.length > 0
        ? 'create'
        : 'compose',
  };
}

export function explainMapping(resolution: MappingResolution): string {
  if (resolution.signatureIssues.length > 0) {
    return `Сопоставление отклонено: ${resolution.signatureIssues.join('; ')}`;
  }

  if (resolution.evidenceIssues.length > 0) {
    return `Цитата не подтверждает концепт: ${resolution.evidenceIssues.join('; ')}`;
  }

  if (resolution.finalResolution === 'reuse' && resolution.implementationId !== null) {
    return `Полностью покрыто реализацией ${resolution.implementationId}`;
  }

  if (resolution.finalResolution === 'compose') {
    return resolution.identity === 'proposed'
      ? 'Новое поведение, но собирается из существующих операций'
      : 'Покрыто композицией примитивов';
  }

  const missing =
    resolution.uncoveredOperations.join(', ') || resolution.operationIssues.join('; ');

  return `Не хватает возможностей: ${missing}`;
}

export function signatureOf(behaviorId: string): BehaviorSignature | null {
  return behaviorById(behaviorId)?.signature ?? null;
}

export type FidelityResult = {
  readonly decision: Executability;
  readonly implementationId: string | null;
  readonly uncovered: readonly string[];
  readonly silentDowngrade: boolean;
};

/** Behaviour-level coverage without a mapping: used by tests and reports. */
export function resolveFidelity(required: readonly string[]): FidelityResult {
  const unique = [...new Set(required)];

  if (unique.length === 0) {
    return {
      decision: 'create',
      implementationId: null,
      uncovered: [],
      silentDowngrade: false,
    };
  }

  const full = IMPLEMENTATIONS.filter((implementation) =>
    unique.every((behavior) => implementation.behaviors.includes(behavior)),
  );

  if (full.length > 0) {
    return {
      decision: 'reuse',
      implementationId: full[0]?.id ?? null,
      uncovered: [],
      silentDowngrade: false,
    };
  }

  const primitives = primitiveBehaviors();
  const missing = unique.filter((behavior) => !primitives.has(behavior));

  if (missing.length === 0) {
    return {
      decision: 'compose',
      implementationId: null,
      uncovered: [],
      silentDowngrade: false,
    };
  }

  return {
    decision: 'create',
    implementationId: null,
    uncovered: missing,
    silentDowngrade: IMPLEMENTATIONS.some((implementation) =>
      implementation.behaviors.some((behavior) => unique.includes(behavior)),
    ),
  };
}

export function explainFidelity(result: FidelityResult): string {
  if (result.decision === 'reuse') {
    return `Полностью покрыто реализацией ${result.implementationId}`;
  }

  if (result.decision === 'compose') {
    return 'Полностью покрыто композицией примитивов';
  }

  const names = result.uncovered
    .map((id) => behaviorById(id)?.meaning ?? id)
    .join('; ');

  return `Не покрыто: ${names}${result.silentDowngrade ? ' (частичное покрытие не считается)' : ''}`;
}

export { BEHAVIORS };
