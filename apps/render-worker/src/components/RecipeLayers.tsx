import {
  cartoonCharacterParamsSchema,
  type RecipeCharacter,
  type RecipeLayerLayout,
  type RecipeLayerSize,
  type StoryboardScene,
  type StoryboardStyle,
} from '@peertoreel/contracts';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { CHARACTER_VIEWBOX } from '../character.js';
import type { ResolvedRecipeLayer, ResolvedSceneRecipe } from '../recipes.js';
import { UnsupportedRecipeLayerError } from '../recipes.js';
import type { InjectedAssetMap } from '../assets.js';
import { CharacterSvg } from './CartoonCharacter.js';
import { CharacterLayer, LightLayer, OverlayLayer, ParticlesLayer } from './layers/AmbientLayers.js';
import { RecipeChartLayer } from './layers/ChartLayers.js';
import { recipeRenderer } from './layers/layer-kind.js';
import { RecipeLayerFrame } from './layers/recipe-layout.js';
import { RecipeTextLayer } from './layers/TextLayer.js';
import { SubjectLayer } from './layers/SubjectLayer.js';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function subjectWidth(layout: RecipeLayerLayout): number {
  switch (layout.size) {
    case 'sm':
      return 30;
    case 'md':
      return 42;
    case 'lg':
      return 56;
    case 'hero':
      return 74;
  }
}

/** Presenter height as a fraction of the video height, by layer size. */
const CHARACTER_HEIGHT: Readonly<Record<RecipeLayerSize, number>> = {
  sm: 0.2,
  md: 0.28,
  lg: 0.36,
  hero: 0.46,
};

/**
 * Presenter inside a layout frame: size comes from the layer, emotion and pose
 * from the slot, accent from the style palette. The slot's own `anchor` is
 * accepted by the contract but placement belongs to the recipe layout.
 */
function RecipeCharacterView({
  character,
  size,
  style,
}: {
  character: RecipeCharacter;
  size: RecipeLayerSize;
  style: StoryboardStyle;
}) {
  const { height } = useVideoConfig();
  const params = cartoonCharacterParamsSchema.parse({
    preset: character.preset,
    emotion: character.emotion,
    pose: character.pose,
    anchor: character.anchor,
    accessories: character.accessories,
    accent: style.palette.accent,
  });

  return (
    <div
      style={{
        height: Math.round(height * CHARACTER_HEIGHT[size]),
        aspectRatio: `${CHARACTER_VIEWBOX.width} / ${CHARACTER_VIEWBOX.height}`,
      }}
    >
      <CharacterSvg params={params} />
    </div>
  );
}

function RecipeLayerView({
  recipeId,
  layer,
  style,
  seconds,
  opacity,
  progress,
  assets,
}: {
  recipeId: string;
  layer: ResolvedRecipeLayer;
  style: StoryboardStyle;
  seconds: number;
  opacity: number;
  progress: number;
  assets?: InjectedAssetMap;
}) {
  const renderer = recipeRenderer(layer.kind);

  switch (renderer) {
    case 'text':
    case 'pill':
    case 'hud-chip':
      return (
        <RecipeLayerFrame layout={layer.layout} opacity={opacity}>
          <RecipeTextLayer
            content={layer.content ?? ''}
            kind={renderer}
            layout={layer.layout}
            style={style}
            opacity={1}
            progress={progress}
          />
        </RecipeLayerFrame>
      );
    case 'subject':
      return (
        <RecipeLayerFrame layout={layer.layout} opacity={opacity}>
          <SubjectLayer
            assetKey={layer.content ?? ''}
            progress={progress}
            opacity={1}
            style={style}
            widthPercent={subjectWidth(layer.layout)}
            assets={assets}
          />
        </RecipeLayerFrame>
      );
    case 'chart':
      if (layer.chart === null) {
        throw new UnsupportedRecipeLayerError(
          recipeId,
          layer.id,
          'chart layer has no chart kind',
        );
      }

      return (
        <RecipeLayerFrame layout={layer.layout} opacity={opacity}>
          <RecipeChartLayer
            chart={layer.chart}
            items={layer.items}
            layout={layer.layout}
            style={style}
            progress={progress}
            opacity={1}
          />
        </RecipeLayerFrame>
      );
    case 'particles':
      return (
        <AbsoluteFill style={{ opacity, pointerEvents: 'none' }}>
          <ParticlesLayer
            content={layer.content ?? 'snow-fall'}
            seconds={seconds}
            style={style}
          />
        </AbsoluteFill>
      );
    case 'light':
      return (
        <AbsoluteFill style={{ opacity, pointerEvents: 'none' }}>
          <LightLayer
            content={layer.content ?? 'cone-warm'}
            seconds={seconds}
            style={style}
          />
        </AbsoluteFill>
      );
    case 'overlay':
      return (
        <AbsoluteFill style={{ opacity, pointerEvents: 'none' }}>
          <OverlayLayer progress={progress} style={style} />
        </AbsoluteFill>
      );
    case 'character':
      if (layer.character === null) {
        return (
          <AbsoluteFill style={{ opacity, pointerEvents: 'none' }}>
            <CharacterLayer
              content={layer.content ?? 'car'}
              seconds={seconds}
              style={style}
            />
          </AbsoluteFill>
        );
      }

      return (
        <RecipeLayerFrame layout={layer.layout} opacity={opacity}>
          <RecipeCharacterView
            character={layer.character}
            size={layer.layout.size}
            style={style}
          />
        </RecipeLayerFrame>
      );
    default:
      throw new UnsupportedRecipeLayerError(
        recipeId,
        layer.id,
        `unknown layer kind "${String(layer.kind)}"`,
      );
  }
}

/**
 * Render a resolved recipe layer plan. Windows are fractions of the scene
 * duration, converted here; no wall clock and no per-topic branching.
 */
export function RecipeLayers({
  recipe,
  scene,
  style,
  assets,
}: {
  recipe: ResolvedSceneRecipe;
  scene: StoryboardScene;
  style: StoryboardStyle;
  assets?: InjectedAssetMap;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = frame / fps;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {recipe.layers.map((layer) => {
        const startSec = layer.from * scene.durationSec;
        const endSec = layer.to * scene.durationSec;

        if (endSec <= startSec) {
          return null;
        }

        const visibleFrom = Math.max(0, startSec - 0.18);

        if (seconds < visibleFrom || seconds > endSec) {
          return null;
        }

        const appear = interpolate(
          seconds,
          [visibleFrom, Math.min(visibleFrom + 0.35, endSec)],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );
        const disappear = interpolate(
          seconds,
          [Math.max(endSec - 0.25, startSec), endSec],
          [1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );
        const progress = clamp(
          (seconds - startSec) / Math.max(0.001, endSec - startSec),
          0,
          1,
        );

        return (
          <RecipeLayerView
            key={layer.id}
            recipeId={recipe.id}
            layer={layer}
            style={style}
            seconds={seconds}
            opacity={Math.min(appear, disappear)}
            progress={progress}
            assets={assets}
          />
        );
      })}
    </AbsoluteFill>
  );
}
