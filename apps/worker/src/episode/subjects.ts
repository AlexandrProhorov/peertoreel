import {
  GENERATED_SUBJECT_KEY_PREFIX,
  STARTER_ASSET_CATALOG,
  STARTER_ASSET_KEYS,
  getStoryboardRecipe,
  isStarterAssetKey,
  type StarterAssetKey,
  type Storyboard,
  type StoryboardScene,
} from '@peertoreel/contracts';

/**
 * Episode mode replaces subject slots. Pixabay mode turns every slot into a
 * stock query; DeepSeek mode resolves only generated `subject/<slug>` slots and
 * leaves the rest on Tier 0 (M3.6b.9).
 */
export interface EpisodeSubjectQuery {
  query: string;
  lang: 'ru' | undefined;
}

export interface EpisodeSubject {
  sceneId: string;
  sceneIdx: number;
  /** The reference the storyboard uses (`assets/starter/dog-snout.svg` or a key). */
  reference: string;
  /**
   * Ordered attempts: starter tags first, then the scene description. A real
   * image stops the list; an empty first query falls through to the second.
   */
  queries: readonly EpisodeSubjectQuery[];
  /** True for a generated `subject/<slug>` slot, false for a starter asset. */
  generated: boolean;
  /** Declared provider prompt; null for starter slots or object references. */
  prompt: string | null;
  /** Declared Tier 0 icon; a failed generation falls back to it. */
  fallbackKey: StarterAssetKey | null;
}

const KEY_BY_REFERENCE = new Map<string, string>(
  STARTER_ASSET_KEYS.map((key) => [STARTER_ASSET_CATALOG[key].path, key]),
);

/** Only the three most specific tags: longer queries return unrelated photos. */
export function queriesForReference(
  reference: string,
  fallbackDescription: string,
): EpisodeSubjectQuery[] {
  const key = KEY_BY_REFERENCE.get(reference);
  const queries: EpisodeSubjectQuery[] = [];

  if (key !== undefined && isStarterAssetKey(key)) {
    queries.push({
      query: STARTER_ASSET_CATALOG[key].tags.slice(0, 3).join(' '),
      lang: undefined,
    });
  }

  const description = fallbackDescription.trim();

  if (description.length > 0) {
    queries.push({ query: description, lang: 'ru' });
  }

  // A description equal to the tag query would spend the second Pixabay call
  // for the same result; keep the order stable and drop only exact repeats.
  return queries.filter(
    (attempt, index) =>
      queries.findIndex((other) => other.query === attempt.query) === index,
  );
}

function subjectSlots(scene: StoryboardScene): {
  reference: string;
  prompt: string | null;
  fallbackKey: StarterAssetKey | null;
}[] {
  const slots = new Map<
    string,
    {
      reference: string;
      prompt: string | null;
      fallbackKey: StarterAssetKey | null;
    }
  >();

  if (scene.implementation.type === 'recipe') {
    const recipe = getStoryboardRecipe(scene.implementation.recipeId);
    const values = scene.implementation.slots as Readonly<
      Record<string, unknown>
    >;

    for (const spec of recipe?.slotSpecs ?? []) {
      if (spec.kind !== 'subject') {
        continue;
      }

      const value = values[spec.name];

      if (
        typeof value === 'object' &&
        value !== null &&
        'assetKey' in value &&
        typeof value.assetKey === 'string'
      ) {
        const assetKey = value.assetKey;
        const reference = isStarterAssetKey(assetKey)
          ? STARTER_ASSET_CATALOG[assetKey].path
          : assetKey;

        // First wins: the same key declared twice must not flip the prompt.
        if (!slots.has(reference)) {
          slots.set(reference, {
            reference,
            prompt:
              'prompt' in value && typeof value.prompt === 'string'
                ? value.prompt
                : null,
            fallbackKey:
              'fallbackIcon' in value &&
              typeof value.fallbackIcon === 'string' &&
              isStarterAssetKey(value.fallbackIcon)
                ? value.fallbackIcon
                : null,
          });
        }
      }
    }
  }

  for (const object of scene.objects) {
    if (object.kind === 'subject' && object.content !== null) {
      if (!slots.has(object.content)) {
        slots.set(object.content, {
          reference: object.content,
          prompt: null,
          fallbackKey: null,
        });
      }
    }
  }

  return [...slots.values()];
}

/** All subject slots of a storyboard, deduplicated per scene. */
export function collectEpisodeSubjects(
  storyboard: Storyboard,
): EpisodeSubject[] {
  const subjects: EpisodeSubject[] = [];

  storyboard.scenes.forEach((scene, sceneIdx) => {
    for (const slot of subjectSlots(scene)) {
      const queries = queriesForReference(slot.reference, scene.description);

      if (queries.length === 0) {
        continue;
      }

      subjects.push({
        sceneId: scene.id,
        sceneIdx,
        reference: slot.reference,
        queries,
        generated: slot.reference.startsWith(GENERATED_SUBJECT_KEY_PREFIX),
        prompt: slot.prompt,
        fallbackKey: slot.fallbackKey,
      });
    }
  });

  return subjects;
}
