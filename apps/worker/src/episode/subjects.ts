import {
  STARTER_ASSET_CATALOG,
  STARTER_ASSET_KEYS,
  getStoryboardRecipe,
  isStarterAssetKey,
  type Storyboard,
  type StoryboardScene,
} from '@peertoreel/contracts';

/**
 * Episode mode only replaces subject slots. Every other reference stays Tier 0
 * (starter SVG), so the renderer always has something to draw.
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

function subjectReferences(scene: StoryboardScene): string[] {
  const references = new Set<string>();

  if (scene.implementation.type === 'recipe') {
    const recipe = getStoryboardRecipe(scene.implementation.recipeId);
    const slots = scene.implementation.slots as Readonly<
      Record<string, unknown>
    >;

    for (const spec of recipe?.slotSpecs ?? []) {
      if (spec.kind !== 'subject') {
        continue;
      }

      const value = slots[spec.name];

      if (
        typeof value === 'object' &&
        value !== null &&
        'assetKey' in value &&
        typeof value.assetKey === 'string'
      ) {
        const assetKey = value.assetKey;
        references.add(
          isStarterAssetKey(assetKey)
            ? STARTER_ASSET_CATALOG[assetKey].path
            : assetKey,
        );
      }
    }
  }

  for (const object of scene.objects) {
    if (object.kind === 'subject' && object.content !== null) {
      references.add(object.content);
    }
  }

  return [...references];
}

/** All subject slots of a storyboard, deduplicated per scene. */
export function collectEpisodeSubjects(
  storyboard: Storyboard,
): EpisodeSubject[] {
  const subjects: EpisodeSubject[] = [];

  storyboard.scenes.forEach((scene, sceneIdx) => {
    for (const reference of subjectReferences(scene)) {
      const queries = queriesForReference(reference, scene.description);

      if (queries.length === 0) {
        continue;
      }

      subjects.push({ sceneId: scene.id, sceneIdx, reference, queries });
    }
  });

  return subjects;
}
