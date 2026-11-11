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
export interface EpisodeSubject {
  sceneId: string;
  sceneIdx: number;
  /** The reference the storyboard uses (`assets/starter/dog-snout.svg` or a key). */
  reference: string;
  /** Deterministic Pixabay query: starter tags, else the scene description. */
  query: string;
  lang: 'ru' | undefined;
}

const KEY_BY_REFERENCE = new Map<string, string>(
  STARTER_ASSET_KEYS.map((key) => [STARTER_ASSET_CATALOG[key].path, key]),
);

/** Only the three most specific tags: longer queries return unrelated photos. */
export function queryForReference(
  reference: string,
  fallbackDescription: string,
): { query: string; lang: 'ru' | undefined } {
  const key = KEY_BY_REFERENCE.get(reference);

  if (key !== undefined && isStarterAssetKey(key)) {
    return {
      query: STARTER_ASSET_CATALOG[key].tags.slice(0, 3).join(' '),
      lang: undefined,
    };
  }

  return { query: fallbackDescription.trim(), lang: 'ru' };
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
      const { query, lang } = queryForReference(
        reference,
        scene.description,
      );

      if (query.length === 0) {
        continue;
      }

      subjects.push({ sceneId: scene.id, sceneIdx, reference, query, lang });
    }
  });

  return subjects;
}
